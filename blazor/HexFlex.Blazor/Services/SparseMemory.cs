namespace HexFlex.Blazor.Services;

/// <summary>
/// A 64 KB fixed-size block. Stores raw data in <see cref="Data"/> and a
/// 1-bit-per-byte validity bitmap in <see cref="Validity"/> (1024 64-bit words
/// per default 64 KB block). Replaces the previous <c>byte?[]</c> layout, which
/// cost 2 bytes per cell and required nullable checks in every hot loop.
/// </summary>
public sealed class MemoryBlock
{
    public readonly byte[] Data;
    public readonly ulong[] Validity;

    public MemoryBlock(int size)
    {
        Data = new byte[size];
        Validity = new ulong[(size + 63) >> 6];
    }

    public bool IsValid(int offset) => (Validity[offset >> 6] & (1UL << (offset & 63))) != 0UL;

    public void SetValid(int offset)
    {
        Validity[offset >> 6] |= 1UL << (offset & 63);
    }
}

public class SparseMemory
{
    public const int DefaultBlockSize = 64 * 1024; // 64KB
    public const int SegmentGapThreshold = 1024;   // 1KB

    private readonly Dictionary<long, MemoryBlock> _memoryBlocks = new();
    private readonly int _blockSize;
    private long[]? _sortedKeys;

    // "Last block" cache — HEX files write sequentially, so nearly every write
    // is in the same block as the previous one. Avoid the dictionary lookup.
    private long _lastBlockKey = long.MinValue;
    private MemoryBlock? _lastBlock;

    // Incremental tracking
    private long _dataSize;
    private long _minAddress = long.MaxValue;
    private long _maxAddress = long.MinValue;
    private List<MemorySegment>? _cachedSegments;

    public SparseMemory(int blockSize = DefaultBlockSize)
    {
        if (blockSize <= 0) throw new ArgumentException("Block size must be positive.", nameof(blockSize));
        _blockSize = blockSize;
    }

    public int BlockSize => _blockSize;

    private long GetBlockKey(long address) => (address / _blockSize) * _blockSize;

    private int GetOffset(long address) => (int)(address % _blockSize);

    private void InvalidateSortedKeys() => _sortedKeys = null;

    private long[] GetSortedKeys()
    {
        _sortedKeys ??= _memoryBlocks.Keys.OrderBy(k => k).ToArray();
        return _sortedKeys;
    }

    private MemoryBlock GetOrCreateBlock(long blockKey)
    {
        if (_lastBlock is not null && _lastBlockKey == blockKey) return _lastBlock;

        if (!_memoryBlocks.TryGetValue(blockKey, out var block))
        {
            block = new MemoryBlock(_blockSize);
            _memoryBlocks[blockKey] = block;
            InvalidateSortedKeys();
        }

        _lastBlockKey = blockKey;
        _lastBlock = block;
        return block;
    }

    public void SetByte(long address, byte value)
    {
        var block = GetOrCreateBlock(GetBlockKey(address));
        var offset = GetOffset(address);

        ulong mask = 1UL << (offset & 63);
        ref ulong word = ref block.Validity[offset >> 6];
        if ((word & mask) == 0UL)
        {
            _dataSize++;
            word |= mask;
        }
        block.Data[offset] = value;

        if (address < _minAddress) _minAddress = address;
        if (address > _maxAddress) _maxAddress = address;

        _cachedSegments = null;
    }

    /// <summary>
    /// Bulk-write a contiguous run of bytes. Much faster than SetByte per byte:
    /// resolves the block once, handles the (rare) block-boundary crossing by
    /// splitting, and uses Span.CopyTo for the data payload. Validity bits are
    /// set per-byte via OR; for long runs this is still cheaper than the
    /// nullable-wrapped scalar writes it replaces.
    /// </summary>
    public void WriteRange(long startAddress, ReadOnlySpan<byte> data)
    {
        if (data.IsEmpty) return;

        int remaining = data.Length;
        int srcOffset = 0;
        long addr = startAddress;

        while (remaining > 0)
        {
            long blockKey = GetBlockKey(addr);
            int offset = GetOffset(addr);
            int blockRemaining = _blockSize - offset;
            int toWrite = remaining < blockRemaining ? remaining : blockRemaining;

            var block = GetOrCreateBlock(blockKey);
            data.Slice(srcOffset, toWrite).CopyTo(block.Data.AsSpan(offset));

            // Validity bits: count newly-set bits for _dataSize, then OR them in.
            var validity = block.Validity;
            int bitStart = offset;
            int bitEnd = offset + toWrite;
            long newlySet = 0;

            // Handle head partial word
            int wi = bitStart >> 6;
            int bitInWord = bitStart & 63;
            if (bitInWord != 0)
            {
                int bitsInThisWord = Math.Min(64 - bitInWord, toWrite);
                ulong mask = bitsInThisWord >= 64
                    ? ulong.MaxValue
                    : (((1UL << bitsInThisWord) - 1UL) << bitInWord);
                ulong oldBits = validity[wi] & mask;
                validity[wi] |= mask;
                newlySet += System.Numerics.BitOperations.PopCount(mask ^ oldBits);
                wi++;
                bitStart += bitsInThisWord;
            }

            // Handle full words
            while (bitStart + 64 <= bitEnd)
            {
                ulong old = validity[wi];
                validity[wi] = ulong.MaxValue;
                newlySet += 64 - System.Numerics.BitOperations.PopCount(old);
                wi++;
                bitStart += 64;
            }

            // Handle trailing partial word
            if (bitStart < bitEnd)
            {
                int tailBits = bitEnd - bitStart;
                ulong mask = (1UL << tailBits) - 1UL;
                ulong oldBits = validity[wi] & mask;
                validity[wi] |= mask;
                newlySet += System.Numerics.BitOperations.PopCount(mask ^ oldBits);
            }

            _dataSize += newlySet;

            remaining -= toWrite;
            srcOffset += toWrite;
            addr += toWrite;
        }

        if (startAddress < _minAddress) _minAddress = startAddress;
        long endAddr = startAddress + data.Length - 1;
        if (endAddr > _maxAddress) _maxAddress = endAddr;

        _cachedSegments = null;
    }

    public byte? GetByte(long address)
    {
        var blockKey = GetBlockKey(address);
        if (!_memoryBlocks.TryGetValue(blockKey, out var block)) return null;
        int offset = GetOffset(address);
        if (!block.IsValid(offset)) return null;
        return block.Data[offset];
    }

    /// <summary>
    /// Bulk-read bytes from a contiguous address range into pre-allocated arrays.
    /// Fills <paramref name="data"/> with the byte values and <paramref name="validity"/>
    /// with 1 for each address that is present (0 for absent).
    /// </summary>
    public void ReadRange(long startAddress, int count, byte[] data, byte[] validity)
    {
        int i = 0;
        while (i < count)
        {
            long addr = startAddress + i;
            var blockKey = GetBlockKey(addr);
            int offset = GetOffset(addr);

            if (!_memoryBlocks.TryGetValue(blockKey, out var block))
            {
                int remaining = _blockSize - offset;
                int skip = Math.Min(remaining, count - i);
                i += skip;
                continue;
            }

            int blockRemaining = _blockSize - offset;
            int toCopy = Math.Min(blockRemaining, count - i);

            // Copy bytes wholesale; then set validity bytes per bit.
            block.Data.AsSpan(offset, toCopy).CopyTo(data.AsSpan(i, toCopy));

            var vbits = block.Validity;
            for (int j = 0; j < toCopy; j++)
            {
                int pos = offset + j;
                if ((vbits[pos >> 6] & (1UL << (pos & 63))) != 0UL)
                    validity[i + j] = 1;
                else
                    data[i + j] = 0; // overwrite back to zero for invalid positions
            }
            i += toCopy;
        }
    }

    public long GetStartAddress()
    {
        if (_memoryBlocks.Count == 0) return 0;
        return _minAddress;
    }

    public long GetEndAddress()
    {
        if (_memoryBlocks.Count == 0) return 0;
        return _maxAddress;
    }

    public long GetDataSize()
    {
        return _dataSize;
    }

    public bool IsEmpty => _memoryBlocks.Count == 0;

    public void Clear()
    {
        _memoryBlocks.Clear();
        InvalidateSortedKeys();
        _lastBlockKey = long.MinValue;
        _lastBlock = null;
        _dataSize = 0;
        _minAddress = long.MaxValue;
        _maxAddress = long.MinValue;
        _cachedSegments = null;
    }

    public IReadOnlyDictionary<long, MemoryBlock> MemoryBlocks => _memoryBlocks;

    /// <summary>
    /// Identifies contiguous regions of memory containing "meaningful" data
    /// (bytes that are valid and not 0xFF). Regions separated by gaps larger
    /// than SegmentGapThreshold are reported as separate segments. Results
    /// are cached until the next SetByte/WriteRange/Clear call.
    /// </summary>
    public List<MemorySegment> GetDataSegments()
    {
        if (_cachedSegments != null) return _cachedSegments;

        if (IsEmpty)
        {
            _cachedSegments = new();
            return _cachedSegments;
        }

        var allSubSegments = new List<(long Start, long End)>();
        var sortedKeys = GetSortedKeys();

        foreach (var key in sortedKeys)
        {
            var block = _memoryBlocks[key];
            var data = block.Data;
            var validity = block.Validity;
            long subStart = -1;
            long subEnd = -1;

            // Iterate by 64-bit validity words — for empty words (all zero) we
            // can skip 64 offsets at a stride. This is a big win for sparse
            // blocks that contain a few bytes surrounded by empty space.
            int wordCount = validity.Length;
            for (int w = 0; w < wordCount; w++)
            {
                ulong word = validity[w];
                int baseOffset = w << 6;

                if (word == 0UL)
                {
                    if (subStart != -1)
                    {
                        allSubSegments.Add((subStart, subEnd));
                        subStart = -1;
                    }
                    continue;
                }

                int wordLimit = Math.Min(64, _blockSize - baseOffset);
                for (int bit = 0; bit < wordLimit; bit++)
                {
                    bool valid = (word & (1UL << bit)) != 0UL;
                    if (!valid || data[baseOffset + bit] == 0xFF)
                    {
                        if (subStart != -1)
                        {
                            allSubSegments.Add((subStart, subEnd));
                            subStart = -1;
                        }
                    }
                    else
                    {
                        long addr = key + baseOffset + bit;
                        if (subStart == -1)
                        {
                            subStart = addr;
                            subEnd = addr;
                        }
                        else
                        {
                            subEnd = addr;
                        }
                    }
                }
            }

            if (subStart != -1)
            {
                allSubSegments.Add((subStart, subEnd));
            }
        }

        if (allSubSegments.Count == 0)
        {
            _cachedSegments = new();
            return _cachedSegments;
        }

        var segments = new List<MemorySegment>();
        var current = allSubSegments[0];

        for (int i = 1; i < allSubSegments.Count; i++)
        {
            var next = allSubSegments[i];
            long gap = next.Start - current.End - 1;

            if (gap < SegmentGapThreshold)
            {
                current.End = next.End;
            }
            else
            {
                segments.Add(new MemorySegment(current.Start, current.End));
                current = next;
            }
        }
        segments.Add(new MemorySegment(current.Start, current.End));

        _cachedSegments = segments;
        return _cachedSegments;
    }
}

public record MemorySegment(long Start, long End)
{
    public long Size => End - Start + 1;
}
