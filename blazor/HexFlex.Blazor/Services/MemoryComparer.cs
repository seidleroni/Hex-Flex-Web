namespace HexFlex.Blazor.Services;

public enum DiffType
{
    Unchanged,
    Modified,
    Added,
    Removed
}

public record DiffEntry(DiffType Type, byte? ByteA, byte? ByteB);

public record DiffStats(long Modified, long Added, long Removed);

public class ComparisonVirtualRow
{
    public bool IsGap { get; init; }
    public long Address { get; init; }       // Row start address (data rows)
    public int SegmentIndex { get; init; }
    public long SkippedBytes { get; init; }  // Gap rows only
    public long GapStartAddr { get; init; }  // Gap rows only
    public long GapEndAddr { get; init; }    // Gap rows only
}

public class ComparisonSegment
{
    public long Start { get; init; }
    public long End { get; init; }
    public long Size { get; init; }
}

public class ComparisonResult
{
    private const int BytesPerRow = 16;
    private const int SegmentGapThreshold = 1024; // 1KB

    // Pre-built during construction
    private readonly List<ComparisonVirtualRow> _virtualRows;
    private readonly List<long> _diffAddresses;
    private readonly List<ComparisonSegment> _segments;

    // Flat arrays built during construction (no dictionary needed)
    private readonly byte[] _diffTypes;
    private readonly byte[] _bytesA;
    private readonly byte[] _bytesB;
    private readonly byte[] _validity;

    public DiffStats Stats { get; }

    public ComparisonResult(SparseMemory memoryA, SparseMemory memoryB)
    {
        var blocksA = memoryA.MemoryBlocks;
        var blocksB = memoryB.MemoryBlocks;
        int blockSize = memoryA.BlockSize;

        // Collect and sort block keys
        var allBlockKeys = new HashSet<long>(blocksA.Keys);
        allBlockKeys.UnionWith(blocksB.Keys);
        var sortedBlockKeys = new List<long>(allBlockKeys);
        sortedBlockKeys.Sort();

        // --- Pass 1: collect row addresses and diff addresses ---
        // Block iteration is sorted and offsets ascend, so row addresses naturally
        // appear in ascending order. Track the last-seen row to drop the HashSet.
        var rowAddressList = new List<long>();
        var diffAddrs = new List<long>();
        long modified = 0, added = 0, removed = 0;
        long lastRowAddr = long.MinValue;

        int wordsPerBlock = (blockSize + 63) >> 6;

        foreach (var blockKey in sortedBlockKeys)
        {
            blocksA.TryGetValue(blockKey, out var blockA);
            blocksB.TryGetValue(blockKey, out var blockB);
            var dataA = blockA?.Data;
            var dataB = blockB?.Data;
            var vA = blockA?.Validity;
            var vB = blockB?.Validity;

            for (int w = 0; w < wordsPerBlock; w++)
            {
                ulong wa = vA is null ? 0UL : vA[w];
                ulong wb = vB is null ? 0UL : vB[w];
                ulong any = wa | wb;
                if (any == 0UL) continue;

                int baseOffset = w << 6;
                while (any != 0UL)
                {
                    int bit = System.Numerics.BitOperations.TrailingZeroCount(any);
                    any &= any - 1;
                    int offset = baseOffset + bit;
                    if (offset >= blockSize) break;

                    ulong mask = 1UL << bit;
                    bool hasA = (wa & mask) != 0UL;
                    bool hasB = (wb & mask) != 0UL;

                    long addr = blockKey + offset;
                    long rowAddr = addr & ~(long)(BytesPerRow - 1);
                    if (rowAddr != lastRowAddr)
                    {
                        rowAddressList.Add(rowAddr);
                        lastRowAddr = rowAddr;
                    }

                    byte a = hasA ? dataA![offset] : (byte)0;
                    byte b = hasB ? dataB![offset] : (byte)0;

                    if (hasA && hasB)
                    {
                        if (a != b) { modified++; diffAddrs.Add(addr); }
                    }
                    else if (hasB)
                    {
                        added++; diffAddrs.Add(addr);
                    }
                    else // hasA
                    {
                        removed++; diffAddrs.Add(addr);
                    }
                }
            }
        }

        Stats = new DiffStats(modified, added, removed);
        _diffAddresses = diffAddrs;

        // Build virtual rows
        _virtualRows = BuildVirtualRows(rowAddressList);
        _segments = BuildSegments(_virtualRows);

        // Row-address → data-row index: since rowAddressList is sorted and
        // each entry maps to the next data-row index, we can assign indices
        // by position and look them up via binary search in pass 2.
        int dataRowCount = rowAddressList.Count;

        // --- Pass 2: fill flat arrays directly ---
        int totalBytes = dataRowCount * BytesPerRow;
        _diffTypes = new byte[totalBytes];
        _bytesA = new byte[totalBytes];
        _bytesB = new byte[totalBytes];
        _validity = new byte[totalBytes];

        // Monotonic cursor into rowAddressList — each block's rows appear in
        // order, so we never need to rewind.
        int rowCursor = 0;
        long cursorRowAddr = dataRowCount > 0 ? rowAddressList[0] : long.MinValue;

        foreach (var blockKey in sortedBlockKeys)
        {
            blocksA.TryGetValue(blockKey, out var blockA);
            blocksB.TryGetValue(blockKey, out var blockB);
            var dataA = blockA?.Data;
            var dataB = blockB?.Data;
            var vA = blockA?.Validity;
            var vB = blockB?.Validity;

            for (int w = 0; w < wordsPerBlock; w++)
            {
                ulong wa = vA is null ? 0UL : vA[w];
                ulong wb = vB is null ? 0UL : vB[w];
                ulong any = wa | wb;
                if (any == 0UL) continue;

                int baseOffset = w << 6;
                while (any != 0UL)
                {
                    int bit = System.Numerics.BitOperations.TrailingZeroCount(any);
                    any &= any - 1;
                    int offset = baseOffset + bit;
                    if (offset >= blockSize) break;

                    ulong mask = 1UL << bit;
                    bool hasA = (wa & mask) != 0UL;
                    bool hasB = (wb & mask) != 0UL;

                    long addr = blockKey + offset;
                    long rowAddr = addr & ~(long)(BytesPerRow - 1);

                    // Advance cursor if we've moved to a new row.
                    while (cursorRowAddr < rowAddr && rowCursor + 1 < dataRowCount)
                    {
                        rowCursor++;
                        cursorRowAddr = rowAddressList[rowCursor];
                    }
                    if (cursorRowAddr != rowAddr) continue; // shouldn't happen

                    int colOffset = (int)(addr - rowAddr);
                    int flatIdx = rowCursor * BytesPerRow + colOffset;

                    byte a = hasA ? dataA![offset] : (byte)0;
                    byte b = hasB ? dataB![offset] : (byte)0;

                    DiffType type;
                    if (hasA && hasB) type = a == b ? DiffType.Unchanged : DiffType.Modified;
                    else if (hasA) type = DiffType.Removed;
                    else type = DiffType.Added;

                    _diffTypes[flatIdx] = (byte)type;
                    _bytesA[flatIdx] = hasA ? a : b;
                    _bytesB[flatIdx] = hasB ? b : a;
                    _validity[flatIdx] = 1;
                }
            }
        }
    }

    private static List<ComparisonVirtualRow> BuildVirtualRows(List<long> sortedRowAddresses)
    {
        var virtualRows = new List<ComparisonVirtualRow>();
        if (sortedRowAddresses.Count == 0)
            return virtualRows;

        int segmentIndex = 0;
        long lastRowAddress = sortedRowAddresses[0];
        virtualRows.Add(new ComparisonVirtualRow { Address = lastRowAddress, SegmentIndex = segmentIndex });

        for (int i = 1; i < sortedRowAddresses.Count; i++)
        {
            long currentRowAddress = sortedRowAddresses[i];
            long gap = currentRowAddress - lastRowAddress;

            if (gap >= SegmentGapThreshold)
                segmentIndex++;

            if (gap > BytesPerRow)
            {
                long skippedBytes = gap - BytesPerRow;
                long gapStart = lastRowAddress + BytesPerRow;
                long gapEnd = currentRowAddress - 1;
                virtualRows.Add(new ComparisonVirtualRow
                {
                    IsGap = true,
                    SegmentIndex = segmentIndex,
                    SkippedBytes = skippedBytes,
                    GapStartAddr = gapStart,
                    GapEndAddr = gapEnd
                });
            }

            virtualRows.Add(new ComparisonVirtualRow { Address = currentRowAddress, SegmentIndex = segmentIndex });
            lastRowAddress = currentRowAddress;
        }

        return virtualRows;
    }

    private static List<ComparisonSegment> BuildSegments(List<ComparisonVirtualRow> virtualRows)
    {
        var segments = new List<ComparisonSegment>();
        if (virtualRows.Count == 0)
            return segments;

        var segmentsMap = new Dictionary<int, (long start, long end)>();

        foreach (var vRow in virtualRows)
        {
            if (vRow.IsGap) continue;

            if (segmentsMap.TryGetValue(vRow.SegmentIndex, out var range))
            {
                segmentsMap[vRow.SegmentIndex] = (range.start, vRow.Address);
            }
            else
            {
                segmentsMap[vRow.SegmentIndex] = (vRow.Address, vRow.Address);
            }
        }

        foreach (var kvp in segmentsMap.OrderBy(k => k.Key))
        {
            long endAddress = kvp.Value.end + BytesPerRow - 1;
            segments.Add(new ComparisonSegment
            {
                Start = kvp.Value.start,
                End = endAddress,
                Size = endAddress - kvp.Value.start + 1
            });
        }

        return segments;
    }

    public List<long> GetDiffAddresses() => _diffAddresses;

    public List<ComparisonVirtualRow> GetVirtualRows() => _virtualRows;

    public List<ComparisonSegment> GetDataSegments() => _segments;

    /// <summary>
    /// Look up the diff entry at a single address. Returns null if the address is
    /// outside every tracked row. Intended for correctness checks / test assertions —
    /// the bulk rendering path uses the flat arrays from <see cref="GetDiffArrays"/>.
    /// </summary>
    public DiffEntry? GetDiffEntry(long address)
    {
        long rowAddr = (address / BytesPerRow) * BytesPerRow;

        // Find the data row with this address. _virtualRows mixes gap + data rows,
        // but data rows appear in ascending address order. Build a flat data-row
        // index map once (lazy).
        var map = _rowIndexMap ??= BuildRowIndexMap();
        if (!map.TryGetValue(rowAddr, out int rowIdx))
            return null;

        int colOffset = (int)(address - rowAddr);
        int flatIdx = rowIdx * BytesPerRow + colOffset;

        if (_validity[flatIdx] == 0)
            return null;

        var type = (DiffType)_diffTypes[flatIdx];
        byte? byteA = (type == DiffType.Added) ? (byte?)null : _bytesA[flatIdx];
        byte? byteB = (type == DiffType.Removed) ? (byte?)null : _bytesB[flatIdx];
        return new DiffEntry(type, byteA, byteB);
    }

    private Dictionary<long, int>? _rowIndexMap;

    private Dictionary<long, int> BuildRowIndexMap()
    {
        var map = new Dictionary<long, int>();
        int dataRowIdx = 0;
        foreach (var vr in _virtualRows)
        {
            if (!vr.IsGap)
            {
                map[vr.Address] = dataRowIdx;
                dataRowIdx++;
            }
        }
        return map;
    }

    /// <summary>
    /// Total number of valid (non-null) byte positions tracked across both files.
    /// Matches the ground-truth "total_addresses" metric.
    /// </summary>
    public long CountValidEntries()
    {
        long count = 0;
        for (int i = 0; i < _validity.Length; i++)
            if (_validity[i] != 0) count++;
        return count;
    }

    /// <summary>
    /// Count of valid entries that match a particular diff type. Intended for tests.
    /// </summary>
    public long CountByType(DiffType type)
    {
        byte t = (byte)type;
        long count = 0;
        for (int i = 0; i < _validity.Length; i++)
            if (_validity[i] != 0 && _diffTypes[i] == t) count++;
        return count;
    }

    /// <summary>
    /// Returns pre-built flat arrays. No extraction needed — built during construction.
    /// </summary>
    public void GetDiffArrays(
        out byte[] diffTypes, out byte[] bytesA, out byte[] bytesB, out byte[] validity)
    {
        diffTypes = _diffTypes;
        bytesA = _bytesA;
        bytesB = _bytesB;
        validity = _validity;
    }
}

public static class MemoryComparer
{
    public static ComparisonResult Compare(SparseMemory memoryA, SparseMemory memoryB) =>
        new ComparisonResult(memoryA, memoryB);
}
