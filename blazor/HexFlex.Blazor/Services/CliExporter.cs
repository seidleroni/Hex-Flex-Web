using System.Text.Json;

namespace HexFlex.Blazor.Services;

/// <summary>
/// Command-line interface for parsing hex files and exporting results as JSON.
/// Used by cross-validation scripts to compare C# parser output against ground truth.
/// </summary>
public static class CliExporter
{
    public static void Run(string[] args)
    {
        if (args.Length < 1)
        {
            Console.Error.WriteLine("Usage: dotnet run -- <command> [args]");
            Console.Error.WriteLine("Commands: parse <hexfile>, compare <hexfileA> <hexfileB>");
            Environment.Exit(1);
        }

        switch (args[0])
        {
            case "parse":
                if (args.Length < 2) { Console.Error.WriteLine("Usage: parse <hexfile>"); Environment.Exit(1); }
                RunParse(args[1]);
                break;
            case "compare":
                if (args.Length < 3) { Console.Error.WriteLine("Usage: compare <hexfileA> <hexfileB>"); Environment.Exit(1); }
                RunCompare(args[1], args[2]);
                break;
            default:
                Console.Error.WriteLine($"Unknown command: {args[0]}");
                Environment.Exit(1);
                break;
        }
    }

    private static void RunParse(string hexFile)
    {
        var content = File.ReadAllText(hexFile);
        var memory = HexParser.Parse(content);
        var segments = memory.GetDataSegments();

        var result = new
        {
            filename = Path.GetFileName(hexFile),
            min_address = memory.GetStartAddress(),
            max_address = memory.GetEndAddress(),
            total_data_bytes = memory.GetDataSize(),
            segment_count = segments.Count,
            segments = segments.Select(s => new
            {
                start = s.Start,
                end = s.End,
                size = s.Size,
                start_hex = $"0x{s.Start:X8}",
                end_hex = $"0x{s.End:X8}",
            }).ToArray(),
        };

        Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
    }

    private static void RunCompare(string hexFileA, string hexFileB)
    {
        var contentA = File.ReadAllText(hexFileA);
        var contentB = File.ReadAllText(hexFileB);
        var memoryA = HexParser.Parse(contentA);
        var memoryB = HexParser.Parse(contentB);

        var result = MemoryComparer.Compare(memoryA, memoryB);

        result.GetDiffArrays(out var diffTypes, out _, out _, out var validity);
        long totalAddresses = 0;
        long unchanged = 0;
        for (int i = 0; i < validity.Length; i++)
        {
            if (validity[i] != 0)
            {
                totalAddresses++;
                if (diffTypes[i] == (byte)DiffType.Unchanged) unchanged++;
            }
        }

        var output = new
        {
            file_a = Path.GetFileName(hexFileA),
            file_b = Path.GetFileName(hexFileB),
            total_addresses = totalAddresses,
            unchanged,
            modified = result.Stats.Modified,
            added = result.Stats.Added,
            removed = result.Stats.Removed,
        };

        Console.WriteLine(JsonSerializer.Serialize(output, new JsonSerializerOptions { WriteIndented = true }));
    }
}
