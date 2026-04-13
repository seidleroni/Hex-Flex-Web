namespace HexFlex.Blazor.Services;

public static class HexParser
{
    /// <summary>
    /// Parses the content of an Intel HEX file into a SparseMemory object.
    /// Supports record types: 0x00 (Data), 0x01 (EOF), 0x02 (Extended Segment Address),
    /// 0x04 (Extended Linear Address), 0x05 (Start Linear Address).
    /// </summary>
    public static SparseMemory Parse(string hexContent)
    {
        var memory = new SparseMemory();
        long baseAddress = 0;

        var lines = hexContent.Split('\n');

        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd('\r').Trim();
            if (!line.StartsWith(':')) continue;
            if (line.Length < 11)
                throw new FormatException($"Invalid record length in line: {line}");

            int byteCount = ParseHexByte(line, 1);
            int address = (ParseHexByte(line, 3) << 8) | ParseHexByte(line, 5);
            int recordType = ParseHexByte(line, 7);

            // Validate we have enough characters for data + checksum
            int expectedLength = 1 + 2 + 4 + 2 + (byteCount * 2) + 2; // : + count + addr + type + data + checksum
            if (line.Length < expectedLength)
                throw new FormatException($"Record too short for declared byte count in line: {line}");

            // Parse data bytes
            var dataBytes = new byte[byteCount];
            for (int i = 0; i < byteCount; i++)
            {
                dataBytes[i] = (byte)ParseHexByte(line, 9 + i * 2);
            }

            // Validate checksum
            int checksum = ParseHexByte(line, 9 + byteCount * 2);
            int calculated = byteCount + (address >> 8) + (address & 0xFF) + recordType;
            for (int i = 0; i < byteCount; i++)
            {
                calculated += dataBytes[i];
            }
            calculated = (256 - (calculated & 0xFF)) & 0xFF;

            if (calculated != checksum)
                throw new FormatException($"Checksum mismatch in line: {line}");

            switch (recordType)
            {
                case 0x00: // Data Record
                    long fullAddress = baseAddress + address;
                    for (int i = 0; i < dataBytes.Length; i++)
                    {
                        memory.SetByte(fullAddress + i, dataBytes[i]);
                    }
                    break;

                case 0x01: // End of File
                    return memory;

                case 0x02: // Extended Segment Address (ISSUE-006 fix)
                    if (byteCount != 2)
                        throw new FormatException("Invalid Extended Segment Address record");
                    baseAddress = ((dataBytes[0] << 8) | dataBytes[1]) << 4;
                    break;

                case 0x04: // Extended Linear Address
                    if (byteCount != 2)
                        throw new FormatException("Invalid Extended Linear Address record");
                    baseAddress = ((long)dataBytes[0] << 24) | ((long)dataBytes[1] << 16);
                    break;

                case 0x05: // Start Linear Address (ignored)
                    break;

                default:
                    break;
            }
        }

        return memory;
    }

    private static int ParseHexByte(string line, int offset)
    {
        int high = HexDigit(line[offset]);
        int low = HexDigit(line[offset + 1]);
        return (high << 4) | low;
    }

    private static int HexDigit(char c) => c switch
    {
        >= '0' and <= '9' => c - '0',
        >= 'A' and <= 'F' => c - 'A' + 10,
        >= 'a' and <= 'f' => c - 'a' + 10,
        _ => throw new FormatException($"Invalid hex character: {c}")
    };
}
