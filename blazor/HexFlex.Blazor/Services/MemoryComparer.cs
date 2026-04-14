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

    private readonly Dictionary<long, DiffEntry> _diffMap = new();
    private readonly DiffEntry _defaultEntry = new(DiffType.Unchanged, null, null);
    private List<ComparisonVirtualRow>? _virtualRows;
    private List<long>? _diffAddresses;
    private List<ComparisonSegment>? _segments;

    public DiffStats Stats { get; }

    public ComparisonResult(SparseMemory memoryA, SparseMemory memoryB)
    {
        long modified = 0, added = 0, removed = 0;

        var blocksA = memoryA.MemoryBlocks;
        var blocksB = memoryB.MemoryBlocks;
        var allBlockKeys = new HashSet<long>(blocksA.Keys);
        allBlockKeys.UnionWith(blocksB.Keys);

        int blockSize = memoryA.BlockSize;

        foreach (var blockKey in allBlockKeys)
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
                DiffType type;

                if (byteA == byteB)
                {
                    type = DiffType.Unchanged;
                }
                else if (byteA is null)
                {
                    type = DiffType.Added;
                    added++;
                }
                else if (byteB is null)
                {
                    type = DiffType.Removed;
                    removed++;
                }
                else
                {
                    type = DiffType.Modified;
                    modified++;
                }

                _diffMap[addr] = new DiffEntry(type, byteA, byteB);
            }
        }

        Stats = new DiffStats(modified, added, removed);
    }

    public DiffEntry GetDiffEntry(long address) =>
        _diffMap.TryGetValue(address, out var entry) ? entry : _defaultEntry;

    public IReadOnlyDictionary<long, DiffEntry> DiffMap => _diffMap;

    public List<long> GetDiffAddresses()
    {
        if (_diffAddresses is null)
        {
            _diffAddresses = _diffMap
                .Where(kvp => kvp.Value.Type != DiffType.Unchanged)
                .Select(kvp => kvp.Key)
                .OrderBy(a => a)
                .ToList();
        }
        return _diffAddresses;
    }

    public List<ComparisonVirtualRow> GetVirtualRows()
    {
        if (_virtualRows is not null)
            return _virtualRows;

        _virtualRows = new List<ComparisonVirtualRow>();

        var addressesWithData = _diffMap.Keys.OrderBy(a => a).ToList();
        if (addressesWithData.Count == 0)
            return _virtualRows;

        // Get unique row-aligned addresses
        var sortedRowAddresses = addressesWithData
            .Select(addr => AlignDown(addr))
            .Distinct()
            .OrderBy(a => a)
            .ToList();

        if (sortedRowAddresses.Count == 0)
            return _virtualRows;

        int segmentIndex = 0;
        long lastRowAddress = sortedRowAddresses[0];
        _virtualRows.Add(new ComparisonVirtualRow { Address = lastRowAddress, SegmentIndex = segmentIndex });

        for (int i = 1; i < sortedRowAddresses.Count; i++)
        {
            long currentRowAddress = sortedRowAddresses[i];
            long gap = currentRowAddress - lastRowAddress;

            // New segment if gap >= 1KB
            if (gap >= SegmentGapThreshold)
                segmentIndex++;

            // Visual gap row for any non-contiguous data rows
            if (gap > BytesPerRow)
            {
                long skippedBytes = gap - BytesPerRow;
                long gapStart = lastRowAddress + BytesPerRow;
                long gapEnd = currentRowAddress - 1;
                _virtualRows.Add(new ComparisonVirtualRow
                {
                    IsGap = true,
                    SegmentIndex = segmentIndex,
                    SkippedBytes = skippedBytes,
                    GapStartAddr = gapStart,
                    GapEndAddr = gapEnd
                });
            }

            _virtualRows.Add(new ComparisonVirtualRow { Address = currentRowAddress, SegmentIndex = segmentIndex });
            lastRowAddress = currentRowAddress;
        }

        return _virtualRows;
    }

    public List<ComparisonSegment> GetDataSegments()
    {
        if (_segments is not null)
            return _segments;

        _segments = new List<ComparisonSegment>();
        var virtualRows = GetVirtualRows();
        if (virtualRows.Count == 0)
            return _segments;

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
            _segments.Add(new ComparisonSegment
            {
                Start = kvp.Value.start,
                End = endAddress,
                Size = endAddress - kvp.Value.start + 1
            });
        }

        return _segments;
    }

    private static long AlignDown(long address) => (address / BytesPerRow) * BytesPerRow;
}

public static class MemoryComparer
{
    public static ComparisonResult Compare(SparseMemory memoryA, SparseMemory memoryB) =>
        new ComparisonResult(memoryA, memoryB);
}
