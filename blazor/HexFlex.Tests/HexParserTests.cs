using System.Text.Json;
using HexFlex.Blazor.Services;

namespace HexFlex.Tests;

public class HexParserTests
{
    // Paths relative to test execution directory — navigate up to repo root
    private static string RepoRoot => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
    private static string TestFilesDir => Path.Combine(RepoRoot, "test_files");
    private static string FixturesDir => Path.Combine(RepoRoot, "test_output", "fixtures");

    private static string ReadTestFile(string filename) =>
        File.ReadAllText(Path.Combine(TestFilesDir, filename));

    private static JsonDocument LoadFixture(string filename) =>
        JsonDocument.Parse(File.ReadAllText(Path.Combine(FixturesDir, filename)));

    [Theory]
    [InlineData("package_complete_123.hex", "package_complete_123_ground_truth.json")]
    [InlineData("package_complete_v142.hex", "package_complete_v142_ground_truth.json")]
    public void Parse_DataSize_MatchesGroundTruth(string hexFile, string fixtureFile)
    {
        var content = ReadTestFile(hexFile);
        var memory = HexParser.Parse(content);
        using var gt = LoadFixture(fixtureFile);

        long expectedDataBytes = gt.RootElement.GetProperty("total_data_bytes").GetInt64();
        Assert.Equal(expectedDataBytes, memory.GetDataSize());
    }

    [Theory]
    [InlineData("package_complete_123.hex", "package_complete_123_ground_truth.json")]
    [InlineData("package_complete_v142.hex", "package_complete_v142_ground_truth.json")]
    public void Parse_AddressRange_MatchesGroundTruth(string hexFile, string fixtureFile)
    {
        var content = ReadTestFile(hexFile);
        var memory = HexParser.Parse(content);
        using var gt = LoadFixture(fixtureFile);

        long expectedMin = gt.RootElement.GetProperty("min_address").GetInt64();
        long expectedMax = gt.RootElement.GetProperty("max_address").GetInt64();

        Assert.Equal(expectedMin, memory.GetStartAddress());
        Assert.Equal(expectedMax, memory.GetEndAddress());
    }

    [Theory]
    [InlineData("package_complete_123.hex", "package_complete_123_ground_truth.json")]
    [InlineData("package_complete_v142.hex", "package_complete_v142_ground_truth.json")]
    public void Parse_SegmentCount_MatchesGroundTruth(string hexFile, string fixtureFile)
    {
        var content = ReadTestFile(hexFile);
        var memory = HexParser.Parse(content);
        using var gt = LoadFixture(fixtureFile);

        int expectedSegments = gt.RootElement.GetProperty("segment_count").GetInt32();
        var segments = memory.GetDataSegments();
        Assert.Equal(expectedSegments, segments.Count);
    }

    [Theory]
    [InlineData("package_complete_123.hex", "package_complete_123_ground_truth.json")]
    [InlineData("package_complete_v142.hex", "package_complete_v142_ground_truth.json")]
    public void Parse_SegmentAddresses_MatchGroundTruth(string hexFile, string fixtureFile)
    {
        var content = ReadTestFile(hexFile);
        var memory = HexParser.Parse(content);
        using var gt = LoadFixture(fixtureFile);

        var expectedSegments = gt.RootElement.GetProperty("segments").EnumerateArray().ToList();
        var actualSegments = memory.GetDataSegments();

        Assert.Equal(expectedSegments.Count, actualSegments.Count);

        for (int i = 0; i < expectedSegments.Count; i++)
        {
            var expected = expectedSegments[i];
            var actual = actualSegments[i];

            long expectedStart = expected.GetProperty("start").GetInt64();
            long expectedEnd = expected.GetProperty("end").GetInt64();
            long expectedSize = expected.GetProperty("size").GetInt64();

            Assert.Equal(expectedStart, actual.Start);
            Assert.Equal(expectedEnd, actual.End);
            Assert.Equal(expectedSize, actual.Size);
        }
    }

    [Theory]
    [InlineData("package_complete_123.hex", "package_complete_123_ground_truth.json")]
    [InlineData("package_complete_v142.hex", "package_complete_v142_ground_truth.json")]
    public void Parse_AllSpotChecks_MatchGroundTruth(string hexFile, string fixtureFile)
    {
        var content = ReadTestFile(hexFile);
        var memory = HexParser.Parse(content);
        using var gt = LoadFixture(fixtureFile);

        var spotChecks = gt.RootElement.GetProperty("spot_checks").EnumerateArray().ToList();
        Assert.True(spotChecks.Count > 1000, $"Expected >1000 spot checks, got {spotChecks.Count}");

        int pass = 0, fail = 0;
        var failures = new List<string>();

        foreach (var check in spotChecks)
        {
            long address = check.GetProperty("address").GetInt64();
            byte expectedValue = (byte)check.GetProperty("value").GetInt32();
            string addressHex = check.GetProperty("address_hex").GetString()!;
            string category = check.GetProperty("category").GetString()!;

            var actual = memory.GetByte(address);

            if (actual is not null && actual.Value == expectedValue)
            {
                pass++;
            }
            else
            {
                fail++;
                if (failures.Count < 20)
                {
                    failures.Add($"{addressHex} [{category}]: expected 0x{expectedValue:X2}, got {(actual is null ? "null" : $"0x{actual.Value:X2}")}");
                }
            }
        }

        Assert.True(fail == 0,
            $"Spot check failures: {fail}/{spotChecks.Count}\n" +
            string.Join("\n", failures));
    }

    [Theory]
    [InlineData("package_complete_123.hex", "package_complete_123_bytes.bin")]
    [InlineData("package_complete_v142.hex", "package_complete_v142_bytes.bin")]
    public void Parse_AllBytes_MatchGroundTruthBinaryDump(string hexFile, string binFile)
    {
        var content = ReadTestFile(hexFile);
        var memory = HexParser.Parse(content);

        var binPath = Path.Combine(FixturesDir, binFile);
        using var stream = File.OpenRead(binPath);
        using var reader = new BinaryReader(stream);

        int segCount = reader.ReadInt32();
        int totalChecked = 0;
        int failures = 0;
        var firstFailures = new List<string>();

        for (int s = 0; s < segCount; s++)
        {
            long segStart = reader.ReadUInt32();
            int segSize = reader.ReadInt32();
            var bytes = reader.ReadBytes(segSize);

            for (int i = 0; i < segSize; i++)
            {
                long addr = segStart + i;
                byte expected = bytes[i];
                var actual = memory.GetByte(addr);
                totalChecked++;

                if (actual is null || actual.Value != expected)
                {
                    failures++;
                    if (firstFailures.Count < 20)
                    {
                        firstFailures.Add($"0x{addr:X8}: expected 0x{expected:X2}, got {(actual is null ? "null" : $"0x{actual.Value:X2}")}");
                    }
                }
            }
        }

        Assert.True(failures == 0,
            $"Byte-level failures: {failures}/{totalChecked}\n" +
            string.Join("\n", firstFailures));
    }

    // --- Record type tests ---

    [Fact]
    public void Parse_InvalidChecksum_Throws()
    {
        // Valid record with checksum tampered (last byte changed)
        var hex = ":0400000508000000EE\n:00000001FF\n";
        Assert.Throws<FormatException>(() => HexParser.Parse(hex));
    }

    [Fact]
    public void Parse_EmptyInput_ReturnsEmptyMemory()
    {
        var memory = HexParser.Parse("");
        Assert.True(memory.IsEmpty);
    }

    [Fact]
    public void Parse_OnlyEOF_ReturnsEmptyMemory()
    {
        var memory = HexParser.Parse(":00000001FF\n");
        Assert.True(memory.IsEmpty);
    }

    [Fact]
    public void Parse_DataRecord_SetsCorrectBytes()
    {
        // Data record: 4 bytes at address 0x0000: 01 02 03 04
        var hex = ":0400000001020304F2\n:00000001FF\n";
        var memory = HexParser.Parse(hex);

        Assert.Equal((byte)0x01, memory.GetByte(0));
        Assert.Equal((byte)0x02, memory.GetByte(1));
        Assert.Equal((byte)0x03, memory.GetByte(2));
        Assert.Equal((byte)0x04, memory.GetByte(3));
        Assert.Null(memory.GetByte(4));
    }

    [Fact]
    public void Parse_ExtendedLinearAddress_SetsBaseCorrectly()
    {
        // ELA record setting upper address to 0x0800
        // Then data at offset 0x0000: AB
        var hex = ":020000040800F2\n:01000000AB54\n:00000001FF\n";
        var memory = HexParser.Parse(hex);

        Assert.Equal((byte)0xAB, memory.GetByte(0x08000000));
    }

    [Fact]
    public void Parse_ExtendedSegmentAddress_SetsBaseCorrectly()
    {
        // Extended Segment Address: base = 0x1000 << 4 = 0x10000
        // Then data byte 0xCD at offset 0x0000 -> address 0x10000
        var hex2 = ":020000021000EC\n:01000000CD32\n:00000001FF\n";
        var memory = HexParser.Parse(hex2);

        // ESA sets base to 0x1000 << 4 = 0x10000
        // Data at offset 0x0000 -> address 0x10000
        Assert.Equal((byte)0xCD, memory.GetByte(0x10000));
    }

    [Fact]
    public void Parse_MissingEOF_StillReturnsData()
    {
        var hex = ":0400000001020304F2\n";
        var memory = HexParser.Parse(hex);
        Assert.Equal((byte)0x01, memory.GetByte(0));
        Assert.Equal(4L, memory.GetDataSize());
    }

    [Fact]
    public void Parse_InvalidRecordLength_Throws()
    {
        var hex = ":0400\n:00000001FF\n";
        Assert.Throws<FormatException>(() => HexParser.Parse(hex));
    }
}
