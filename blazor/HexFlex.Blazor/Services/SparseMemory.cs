namespace HexFlex.Blazor.Services;

public class SparseMemory
{
    public const int DefaultBlockSize = 64 * 1024; // 64KB
    public const int SegmentGapThreshold = 1024;    // 1KB

    private readonly Dictionary<long, byte?[]> _memoryBlocks = new();
    private readonly int _blockSize;
    private long[]? _sortedKeys;

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

    public void SetByte(long address, byte value)
    {
        var blockKey = GetBlockKey(address);
        if (!_memoryBlocks.TryGetValue(blockKey, out var block))
        {
            block = new byte?[_blockSize];
            _memoryBlocks[blockKey] = block;
            InvalidateSortedKeys();
        }
        var offset = GetOffset(address);
        if (block[offset] is null)
            _dataSize++;
        block[offset] = value;

        if (address < _minAddress) _minAddress = address;
        if (address > _maxAddress) _maxAddress = address;

        _cachedSegments = null; // invalidate segment cache
    }

    public byte? GetByte(long address)
    {
        var blockKey = GetBlockKey(address);
        if (_memoryBlocks.TryGetValue(blockKey, out var block))
        {
            return block[GetOffset(address)];
        }
        return null;
    }

    /// <summary>
    /// Bulk-read bytes from a contiguous address range into pre-allocated arrays.
    /// Much faster than calling GetByte() per byte — avoids repeated dictionary lookups.
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
                // No block — skip ahead to next block boundary
                int remaining = _blockSize - offset;
                int skip = Math.Min(remaining, count - i);
                // data[]/validity[] already zeroed by default
                i += skip;
                continue;
            }

            // Copy from this block until end of block or end of requested range
            int blockRemaining = _blockSize - offset;
            int toCopy = Math.Min(blockRemaining, count - i);

            for (int j = 0; j < toCopy; j++)
            {
                var b = block[offset + j];
                if (b.HasValue)
                {
                    data[i + j] = b.Value;
                    validity[i + j] = 1;
                }
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
        _dataSize = 0;
        _minAddress = long.MaxValue;
        _maxAddress = long.MinValue;
        _cachedSegments = null;
    }

    public IReadOnlyDictionary<long, byte?[]> MemoryBlocks => _memoryBlocks;

    /// <summary>
    /// Identifies contiguous regions of memory containing "meaningful" data
    /// (any byte that is not null and not 0xFF). Regions separated by gaps
    /// larger than SegmentGapThreshold are reported as separate segments.
    /// Results are cached until the next SetByte/Clear call.
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
            long subStart = -1;
            long subEnd = -1;

            for (int offset = 0; offset < _blockSize; offset++)
            {
                var b = block[offset];
                bool isMeaningful = b is not null && b != 0xFF;

                if (isMeaningful)
                {
                    long addr = key + offset;
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
                else
                {
                    if (subStart != -1)
                    {
                        allSubSegments.Add((subStart, subEnd));
                        subStart = -1;
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
