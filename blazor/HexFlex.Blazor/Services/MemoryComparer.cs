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

    private readonly Dictionary<long, DiffEntry> _diffMap;
    private readonly DiffEntry _defaultEntry = new(DiffType.Unchanged, null, null);

    // Pre-built during construction — no lazy LINQ needed
    private readonly List<ComparisonVirtualRow> _virtualRows;
    private readonly List<long> _diffAddresses;
    private readonly List<ComparisonSegment> _segments;

    public DiffStats Stats { get; }

    public ComparisonResult(SparseMemory memoryA, SparseMemory memoryB)
    {
        long modified = 0, added = 0, removed = 0;

        var blocksA = memoryA.MemoryBlocks;
        var blocksB = memoryB.MemoryBlocks;
        int blockSize = memoryA.BlockSize;

        // Collect and SORT block keys so addresses come out in order
        var allBlockKeys = new HashSet<long>(blocksA.Keys);
        allBlockKeys.UnionWith(blocksB.Keys);
        var sortedBlockKeys = new List<long>(allBlockKeys);
        sortedBlockKeys.Sort();

        // Pre-size the dictionary to avoid rehashing
        _diffMap = new Dictionary<long, DiffEntry>(sortedBlockKeys.Count * 16);

        // Collect row-aligned addresses and diff addresses in order during the pass
        var rowAddressSet = new HashSet<long>();
        var rowAddressList = new List<long>();
        var diffAddrs = new List<long>();

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

                // Track row addresses (already in sorted order since blocks are sorted)
                long rowAddr = (addr / BytesPerRow) * BytesPerRow;
                if (rowAddressSet.Add(rowAddr))
                    rowAddressList.Add(rowAddr);

                // Track diff addresses
                if (type != DiffType.Unchanged)
                    diffAddrs.Add(addr);
            }
        }

        Stats = new DiffStats(modified, added, removed);
        _diffAddresses = diffAddrs; // Already sorted (blocks iterated in order)

        // Build virtual rows — rowAddressList is already sorted
        _virtualRows = BuildVirtualRows(rowAddressList);

        // Build segments from virtual rows
        _segments = BuildSegments(_virtualRows);
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

    public DiffEntry GetDiffEntry(long address) =>
        _diffMap.TryGetValue(address, out var entry) ? entry : _defaultEntry;

    public IReadOnlyDictionary<long, DiffEntry> DiffMap => _diffMap;

    public List<long> GetDiffAddresses() => _diffAddresses;

    public List<ComparisonVirtualRow> GetVirtualRows() => _virtualRows;

    public List<ComparisonSegment> GetDataSegments() => _segments;

    /// <summary>
    /// Bulk-extract diff data for all data rows into flat arrays.
    /// Call once, share between ComparisonHexViewer and ComparisonMinimap.
    /// </summary>
    public void ExtractDiffArrays(
        out byte[] diffTypes, out byte[] bytesA, out byte[] bytesB, out byte[] validity,
        out int dataRowCount)
    {
        dataRowCount = 0;
        foreach (var vr in _virtualRows)
        {
            if (!vr.IsGap) dataRowCount++;
        }

        int totalBytes = dataRowCount * BytesPerRow;
        diffTypes = new byte[totalBytes];
        bytesA = new byte[totalBytes];
        bytesB = new byte[totalBytes];
        validity = new byte[totalBytes];

        int dataIdx = 0;
        foreach (var vr in _virtualRows)
        {
            if (vr.IsGap) continue;

            int baseOffset = dataIdx * BytesPerRow;
            for (int j = 0; j < BytesPerRow; j++)
            {
                long addr = vr.Address + j;
                if (_diffMap.TryGetValue(addr, out var entry))
                {
                    diffTypes[baseOffset + j] = (byte)entry.Type;
                    bytesA[baseOffset + j] = entry.ByteA ?? 0;
                    bytesB[baseOffset + j] = entry.ByteB ?? (entry.ByteA ?? 0);
                    validity[baseOffset + j] = 1;
                }
            }
            dataIdx++;
        }
    }
}

public static class MemoryComparer
{
    public static ComparisonResult Compare(SparseMemory memoryA, SparseMemory memoryB) =>
        new ComparisonResult(memoryA, memoryB);
}
