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

        // Single-pass construction. Block iteration is sorted and offsets
        // ascend, so row addresses naturally arrive in order. We grow the flat
        // output arrays by row (doubling on overflow) and emit one entry to
        // rowAddressList per new row. Amortized cost: one resolve + copy per
        // valid byte.
        var rowAddressList = new List<long>();
        var diffAddrs = new List<long>();
        long modified = 0, added = 0, removed = 0;
        long lastRowAddr = long.MinValue;
        int rowCount = 0;

        int capRows = 1024;
        var diffTypes = new byte[capRows * BytesPerRow];
        var outA = new byte[capRows * BytesPerRow];
        var outB = new byte[capRows * BytesPerRow];
        var outV = new byte[capRows * BytesPerRow];

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

                // Fast path: both blocks exist, both validity words are fully
                // set (all 64 bytes present in both files) and the 64 data bytes
                // are byte-identical. Mark 4 rows (64/16) as Unchanged in bulk.
                if (wa == ulong.MaxValue && wb == ulong.MaxValue && dataA is not null && dataB is not null)
                {
                    var spanA = dataA.AsSpan(baseOffset, 64);
                    var spanB = dataB.AsSpan(baseOffset, 64);
                    if (spanA.SequenceEqual(spanB))
                    {
                        long wordStartAddr = blockKey + baseOffset;
                        for (int r = 0; r < 4; r++)
                        {
                            long rowAddr = wordStartAddr + r * BytesPerRow;
                            if (rowAddr != lastRowAddr)
                            {
                                EnsureCapacity(ref rowCount, ref capRows, ref diffTypes, ref outA, ref outB, ref outV);
                                rowAddressList.Add(rowAddr);
                                lastRowAddr = rowAddr;
                                rowCount++;
                            }
                            int flatBase = (rowCount - 1) * BytesPerRow;
                            spanA.Slice(r * BytesPerRow, BytesPerRow).CopyTo(outA.AsSpan(flatBase, BytesPerRow));
                            spanA.Slice(r * BytesPerRow, BytesPerRow).CopyTo(outB.AsSpan(flatBase, BytesPerRow));
                            outV.AsSpan(flatBase, BytesPerRow).Fill(1);
                            // diffTypes already zero (Unchanged = 0)
                        }
                        continue;
                    }
                }

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
                        EnsureCapacity(ref rowCount, ref capRows, ref diffTypes, ref outA, ref outB, ref outV);
                        rowAddressList.Add(rowAddr);
                        lastRowAddr = rowAddr;
                        rowCount++;
                    }

                    int colOffset = (int)(addr - rowAddr);
                    int flatIdx = (rowCount - 1) * BytesPerRow + colOffset;

                    byte a = hasA ? dataA![offset] : (byte)0;
                    byte b = hasB ? dataB![offset] : (byte)0;

                    DiffType type;
                    if (hasA && hasB)
                    {
                        if (a == b) { type = DiffType.Unchanged; }
                        else { type = DiffType.Modified; modified++; diffAddrs.Add(addr); }
                    }
                    else if (hasB) { type = DiffType.Added; added++; diffAddrs.Add(addr); }
                    else /* hasA */ { type = DiffType.Removed; removed++; diffAddrs.Add(addr); }

                    diffTypes[flatIdx] = (byte)type;
                    outA[flatIdx] = hasA ? a : b;
                    outB[flatIdx] = hasB ? b : a;
                    outV[flatIdx] = 1;
                }
            }
        }

        Stats = new DiffStats(modified, added, removed);
        _diffAddresses = diffAddrs;

        // Trim to rowCount-sized outputs (arrays doubled beyond what we needed)
        int totalBytes = rowCount * BytesPerRow;
        if (totalBytes != diffTypes.Length)
        {
            Array.Resize(ref diffTypes, totalBytes);
            Array.Resize(ref outA, totalBytes);
            Array.Resize(ref outB, totalBytes);
            Array.Resize(ref outV, totalBytes);
        }
        _diffTypes = diffTypes;
        _bytesA = outA;
        _bytesB = outB;
        _validity = outV;

        _virtualRows = BuildVirtualRows(rowAddressList);
        _segments = BuildSegments(_virtualRows);
    }

    private static void EnsureCapacity(
        ref int rowCount, ref int capRows,
        ref byte[] diffTypes, ref byte[] outA, ref byte[] outB, ref byte[] outV)
    {
        if (rowCount < capRows) return;
        int newCap = capRows * 2;
        Array.Resize(ref diffTypes, newCap * BytesPerRow);
        Array.Resize(ref outA, newCap * BytesPerRow);
        Array.Resize(ref outB, newCap * BytesPerRow);
        Array.Resize(ref outV, newCap * BytesPerRow);
        capRows = newCap;
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
