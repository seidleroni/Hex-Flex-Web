using System.Text.Json;
using HexFlex.Blazor.Services;

namespace HexFlex.Tests;

public class MemoryComparerTests
{
    private static string RepoRoot => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
    private static string TestFilesDir => Path.Combine(RepoRoot, "test_files");
    private static string FixturesDir => Path.Combine(RepoRoot, "test_output", "fixtures");

    [Fact]
    public void Compare_DiffStats_MatchGroundTruth()
    {
        var contentA = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_123.hex"));
        var contentB = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_v142.hex"));

        var memoryA = HexParser.Parse(contentA);
        var memoryB = HexParser.Parse(contentB);

        var result = MemoryComparer.Compare(memoryA, memoryB);

        using var gt = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(FixturesDir, "comparison_ground_truth.json")));

        var root = gt.RootElement;
        long expectedModified = root.GetProperty("modified").GetInt64();
        long expectedAdded = root.GetProperty("added").GetInt64();
        long expectedRemoved = root.GetProperty("removed").GetInt64();
        long expectedUnchanged = root.GetProperty("unchanged").GetInt64();
        long expectedTotal = root.GetProperty("total_addresses").GetInt64();

        Assert.Equal(expectedModified, result.Stats.Modified);
        Assert.Equal(expectedAdded, result.Stats.Added);
        Assert.Equal(expectedRemoved, result.Stats.Removed);

        // Verify total addresses in diff map
        long actualTotal = result.DiffMap.Count;
        Assert.Equal(expectedTotal, actualTotal);

        // Verify unchanged count
        long actualUnchanged = result.DiffMap.Values.Count(d => d.Type == DiffType.Unchanged);
        Assert.Equal(expectedUnchanged, actualUnchanged);
    }

    [Fact]
    public void Compare_SampleModifiedBytes_MatchGroundTruth()
    {
        var contentA = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_123.hex"));
        var contentB = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_v142.hex"));

        var memoryA = HexParser.Parse(contentA);
        var memoryB = HexParser.Parse(contentB);

        var result = MemoryComparer.Compare(memoryA, memoryB);

        using var gt = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(FixturesDir, "comparison_ground_truth.json")));

        var samples = gt.RootElement.GetProperty("sample_modified").EnumerateArray().ToList();
        Assert.True(samples.Count > 0, "No sample modified bytes in fixture");

        foreach (var sample in samples)
        {
            long addr = sample.GetProperty("address").GetInt64();
            byte expectedA = (byte)sample.GetProperty("value_a").GetInt32();
            byte expectedB = (byte)sample.GetProperty("value_b").GetInt32();

            var entry = result.GetDiffEntry(addr);
            Assert.Equal(DiffType.Modified, entry.Type);
            Assert.Equal(expectedA, entry.ByteA);
            Assert.Equal(expectedB, entry.ByteB);
        }
    }

    [Fact]
    public void Compare_SampleAddedBytes_MatchGroundTruth()
    {
        var contentA = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_123.hex"));
        var contentB = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_v142.hex"));

        var memoryA = HexParser.Parse(contentA);
        var memoryB = HexParser.Parse(contentB);

        var result = MemoryComparer.Compare(memoryA, memoryB);

        using var gt = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(FixturesDir, "comparison_ground_truth.json")));

        var samples = gt.RootElement.GetProperty("sample_added").EnumerateArray().ToList();
        Assert.True(samples.Count > 0, "No sample added bytes in fixture");

        foreach (var sample in samples)
        {
            long addr = sample.GetProperty("address").GetInt64();
            byte expectedVal = (byte)sample.GetProperty("value").GetInt32();

            var entry = result.GetDiffEntry(addr);
            Assert.Equal(DiffType.Added, entry.Type);
            Assert.Null(entry.ByteA);
            Assert.Equal(expectedVal, entry.ByteB);
        }
    }

    [Fact]
    public void Compare_SampleRemovedBytes_MatchGroundTruth()
    {
        var contentA = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_123.hex"));
        var contentB = File.ReadAllText(Path.Combine(TestFilesDir, "package_complete_v142.hex"));

        var memoryA = HexParser.Parse(contentA);
        var memoryB = HexParser.Parse(contentB);

        var result = MemoryComparer.Compare(memoryA, memoryB);

        using var gt = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(FixturesDir, "comparison_ground_truth.json")));

        var samples = gt.RootElement.GetProperty("sample_removed").EnumerateArray().ToList();
        Assert.True(samples.Count > 0, "No sample removed bytes in fixture");

        foreach (var sample in samples)
        {
            long addr = sample.GetProperty("address").GetInt64();
            byte expectedVal = (byte)sample.GetProperty("value").GetInt32();

            var entry = result.GetDiffEntry(addr);
            Assert.Equal(DiffType.Removed, entry.Type);
            Assert.Equal(expectedVal, entry.ByteA);
            Assert.Null(entry.ByteB);
        }
    }

    // --- Unit tests for basic comparison logic ---

    [Fact]
    public void Compare_IdenticalMemories_NoChanges()
    {
        var a = new SparseMemory();
        var b = new SparseMemory();
        a.SetByte(0, 0xAB);
        b.SetByte(0, 0xAB);

        var result = MemoryComparer.Compare(a, b);

        Assert.Equal(0, result.Stats.Modified);
        Assert.Equal(0, result.Stats.Added);
        Assert.Equal(0, result.Stats.Removed);
        Assert.Equal(DiffType.Unchanged, result.GetDiffEntry(0).Type);
    }

    [Fact]
    public void Compare_ModifiedByte_Detected()
    {
        var a = new SparseMemory();
        var b = new SparseMemory();
        a.SetByte(100, 0x01);
        b.SetByte(100, 0x02);

        var result = MemoryComparer.Compare(a, b);

        Assert.Equal(1, result.Stats.Modified);
        var entry = result.GetDiffEntry(100);
        Assert.Equal(DiffType.Modified, entry.Type);
        Assert.Equal((byte)0x01, entry.ByteA);
        Assert.Equal((byte)0x02, entry.ByteB);
    }

    [Fact]
    public void Compare_AddedByte_Detected()
    {
        var a = new SparseMemory();
        var b = new SparseMemory();
        b.SetByte(200, 0xFF);

        var result = MemoryComparer.Compare(a, b);

        Assert.Equal(1, result.Stats.Added);
        var entry = result.GetDiffEntry(200);
        Assert.Equal(DiffType.Added, entry.Type);
        Assert.Null(entry.ByteA);
        Assert.Equal((byte)0xFF, entry.ByteB);
    }

    [Fact]
    public void Compare_RemovedByte_Detected()
    {
        var a = new SparseMemory();
        var b = new SparseMemory();
        a.SetByte(300, 0xAA);

        var result = MemoryComparer.Compare(a, b);

        Assert.Equal(1, result.Stats.Removed);
        var entry = result.GetDiffEntry(300);
        Assert.Equal(DiffType.Removed, entry.Type);
        Assert.Equal((byte)0xAA, entry.ByteA);
        Assert.Null(entry.ByteB);
    }

    [Fact]
    public void Compare_EmptyMemories_NoDiffs()
    {
        var result = MemoryComparer.Compare(new SparseMemory(), new SparseMemory());
        Assert.Equal(0, result.Stats.Modified);
        Assert.Equal(0, result.Stats.Added);
        Assert.Equal(0, result.Stats.Removed);
        Assert.Empty(result.DiffMap);
    }
}
