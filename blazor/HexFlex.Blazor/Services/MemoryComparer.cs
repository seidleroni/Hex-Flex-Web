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

public class ComparisonResult
{
    private readonly Dictionary<long, DiffEntry> _diffMap = new();
    private readonly DiffEntry _defaultEntry = new(DiffType.Unchanged, null, null);

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
        var addresses = _diffMap
            .Where(kvp => kvp.Value.Type != DiffType.Unchanged)
            .Select(kvp => kvp.Key)
            .OrderBy(a => a)
            .ToList();
        return addresses;
    }
}

public static class MemoryComparer
{
    public static ComparisonResult Compare(SparseMemory memoryA, SparseMemory memoryB) =>
        new ComparisonResult(memoryA, memoryB);
}
