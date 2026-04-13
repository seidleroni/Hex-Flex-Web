namespace HexFlex.Blazor.Services;

public class SparseMemory
{
    public const int DefaultBlockSize = 64 * 1024; // 64KB
    public const int SegmentGapThreshold = 1024;    // 1KB

    private readonly Dictionary<long, byte?[]> _memoryBlocks = new();
    private readonly int _blockSize;
    private long[]? _sortedKeys;

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
        block[GetOffset(address)] = value;
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

    public long GetStartAddress()
    {
        if (_memoryBlocks.Count == 0) return 0;
        var sortedKeys = GetSortedKeys();
        var firstBlockKey = sortedKeys[0];
        var block = _memoryBlocks[firstBlockKey];
        for (int offset = 0; offset < _blockSize; offset++)
        {
            if (block[offset] is not null)
                return firstBlockKey + offset;
        }
        return 0;
    }

    public long GetEndAddress()
    {
        if (_memoryBlocks.Count == 0) return 0;
        var sortedKeys = GetSortedKeys();
        var lastBlockKey = sortedKeys[^1];
        var block = _memoryBlocks[lastBlockKey];
        for (int offset = _blockSize - 1; offset >= 0; offset--)
        {
            if (block[offset] is not null)
                return lastBlockKey + offset;
        }
        return 0;
    }

    public long GetDataSize()
    {
        long count = 0;
        foreach (var block in _memoryBlocks.Values)
        {
            foreach (var b in block)
            {
                if (b is not null) count++;
            }
        }
        return count;
    }

    public bool IsEmpty => _memoryBlocks.Count == 0;

    public void Clear()
    {
        _memoryBlocks.Clear();
        InvalidateSortedKeys();
    }

    public IReadOnlyDictionary<long, byte?[]> MemoryBlocks => _memoryBlocks;

    /// <summary>
    /// Identifies contiguous regions of memory containing "meaningful" data
    /// (any byte that is not null and not 0xFF). Regions separated by gaps
    /// larger than SegmentGapThreshold are reported as separate segments.
    /// </summary>
    public List<MemorySegment> GetDataSegments()
    {
        if (IsEmpty) return new();

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

        if (allSubSegments.Count == 0) return new();

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

        return segments;
    }
}

public record MemorySegment(long Start, long End)
{
    public long Size => End - Start + 1;
}
