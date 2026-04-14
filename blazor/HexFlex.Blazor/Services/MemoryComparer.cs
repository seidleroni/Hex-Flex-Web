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
        var rowAddressSet = new HashSet<long>();
        var rowAddressList = new List<long>();
        var diffAddrs = new List<long>();
        long modified = 0, added = 0, removed = 0;

        foreach (var blockKey in sortedBlockKeys)
        {
            blocksA.TryGetValue(blockKey, out var blockA);
            blocksB.TryGetValue(blockKey, out var blockB);

            for (int offset = 0; offset < blockSize; offset++)
            {
                var byteA = blockA?[offset];
                var byteB = blockB?[offset];

                if (byteA is null && byteB is null)
                    continue;

                long addr = blockKey + offset;

                // Track row address
                long rowAddr = (addr / BytesPerRow) * BytesPerRow;
                if (rowAddressSet.Add(rowAddr))
                    rowAddressList.Add(rowAddr);

                // Track diff addresses and stats
                if (byteA != byteB)
                {
                    if (byteA is null) added++;
                    else if (byteB is null) removed++;
                    else modified++;
                    diffAddrs.Add(addr);
                }
            }
        }

        Stats = new DiffStats(modified, added, removed);
        _diffAddresses = diffAddrs;

        // Build virtual rows
        _virtualRows = BuildVirtualRows(rowAddressList);
        _segments = BuildSegments(_virtualRows);

        // --- Build rowAddress → dataRowIndex map for pass 2 ---
        var rowIndexMap = new Dictionary<long, int>(rowAddressList.Count);
        int dataRowIdx = 0;
        foreach (var vr in _virtualRows)
        {
            if (!vr.IsGap)
            {
                rowIndexMap[vr.Address] = dataRowIdx;
                dataRowIdx++;
            }
        }

        // --- Pass 2: fill flat arrays directly (no diffMap dictionary) ---
        int totalBytes = dataRowIdx * BytesPerRow;
        _diffTypes = new byte[totalBytes];
        _bytesA = new byte[totalBytes];
        _bytesB = new byte[totalBytes];
        _validity = new byte[totalBytes];

        foreach (var blockKey in sortedBlockKeys)
        {
            blocksA.TryGetValue(blockKey, out var blockA);
            blocksB.TryGetValue(blockKey, out var blockB);

            for (int offset = 0; offset < blockSize; offset++)
            {
                var byteA = blockA?[offset];
                var byteB = blockB?[offset];

                if (byteA is null && byteB is null)
                    continue;

                long addr = blockKey + offset;
                long rowAddr = (addr / BytesPerRow) * BytesPerRow;
                int colOffset = (int)(addr - rowAddr);

                if (!rowIndexMap.TryGetValue(rowAddr, out int rowIdx))
                    continue;

                int flatIdx = rowIdx * BytesPerRow + colOffset;

                DiffType type;
                if (byteA == byteB) type = DiffType.Unchanged;
                else if (byteA is null) type = DiffType.Added;
                else if (byteB is null) type = DiffType.Removed;
                else type = DiffType.Modified;

                _diffTypes[flatIdx] = (byte)type;
                _bytesA[flatIdx] = byteA ?? 0;
                _bytesB[flatIdx] = byteB ?? (byteA ?? 0);
                _validity[flatIdx] = 1;
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
