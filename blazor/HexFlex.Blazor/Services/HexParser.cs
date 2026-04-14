namespace HexFlex.Blazor.Services;

public static class HexParser
{
    // Lookup table: char → nibble value. -1 = invalid.
    private static readonly int[] HexLut = BuildHexLut();

    private static int[] BuildHexLut()
    {
        var lut = new int[128];
        for (int i = 0; i < 128; i++) lut[i] = -1;
        for (int i = 0; i <= 9; i++) { lut['0' + i] = i; }
        for (int i = 0; i < 6; i++) { lut['A' + i] = 10 + i; lut['a' + i] = 10 + i; }
        return lut;
    }

    /// <summary>
    /// Parses the content of an Intel HEX file into a SparseMemory object.
    /// Supports record types: 0x00 (Data), 0x01 (EOF), 0x02 (Extended Segment Address),
    /// 0x04 (Extended Linear Address), 0x05 (Start Linear Address).
    /// </summary>
    public static SparseMemory Parse(string hexContent)
    {
        var memory = new SparseMemory();
        long baseAddress = 0;
        var lut = HexLut;

        int pos = 0;
        int contentLen = hexContent.Length;

        while (pos < contentLen)
        {
            // Skip to next ':' (start of record)
            while (pos < contentLen && hexContent[pos] != ':')
                pos++;

            if (pos >= contentLen) break;

            // Find end of this line
            int lineStart = pos;
            int lineEnd = pos;
            while (lineEnd < contentLen && hexContent[lineEnd] != '\n' && hexContent[lineEnd] != '\r')
                lineEnd++;

            int lineLen = lineEnd - lineStart;
            if (lineLen < 11)
                throw new FormatException($"Invalid record length in line starting at offset {lineStart}");

            // Parse header fields using lookup table
            int byteCount = ParseByte(hexContent, lineStart + 1, lut);
            int addrHi = ParseByte(hexContent, lineStart + 3, lut);
            int addrLo = ParseByte(hexContent, lineStart + 5, lut);
            int address = (addrHi << 8) | addrLo;
            int recordType = ParseByte(hexContent, lineStart + 7, lut);

            // Validate length
            int expectedLength = 1 + 2 + 4 + 2 + (byteCount * 2) + 2;
            if (lineLen < expectedLength)
                throw new FormatException($"Record too short for declared byte count at offset {lineStart}");

            // Parse data bytes + compute checksum in one pass
            int dataStart = lineStart + 9;
            int checksumCalc = byteCount + addrHi + addrLo + recordType;

            switch (recordType)
            {
                case 0x00: // Data Record — write directly to memory
                {
                    long fullAddress = baseAddress + address;
                    for (int i = 0; i < byteCount; i++)
                    {
                        int b = ParseByte(hexContent, dataStart + i * 2, lut);
                        checksumCalc += b;
                        memory.SetByte(fullAddress + i, (byte)b);
                    }
                    break;
                }

                case 0x01: // End of File — validate checksum then return
                {
                    for (int i = 0; i < byteCount; i++)
                        checksumCalc += ParseByte(hexContent, dataStart + i * 2, lut);
                    int checksum = ParseByte(hexContent, dataStart + byteCount * 2, lut);
                    int expected = (256 - (checksumCalc & 0xFF)) & 0xFF;
                    if (expected != checksum)
                        throw new FormatException($"Checksum mismatch at offset {lineStart}");
                    return memory;
                }

                case 0x02: // Extended Segment Address
                {
                    if (byteCount != 2)
                        throw new FormatException("Invalid Extended Segment Address record");
                    int b0 = ParseByte(hexContent, dataStart, lut);
                    int b1 = ParseByte(hexContent, dataStart + 2, lut);
                    checksumCalc += b0 + b1;
                    baseAddress = ((b0 << 8) | b1) << 4;
                    break;
                }

                case 0x04: // Extended Linear Address
                {
                    if (byteCount != 2)
                        throw new FormatException("Invalid Extended Linear Address record");
                    int b0 = ParseByte(hexContent, dataStart, lut);
                    int b1 = ParseByte(hexContent, dataStart + 2, lut);
                    checksumCalc += b0 + b1;
                    baseAddress = ((long)b0 << 24) | ((long)b1 << 16);
                    break;
                }

                case 0x05: // Start Linear Address (ignored)
                {
                    for (int i = 0; i < byteCount; i++)
                        checksumCalc += ParseByte(hexContent, dataStart + i * 2, lut);
                    break;
                }

                default:
                {
                    for (int i = 0; i < byteCount; i++)
                        checksumCalc += ParseByte(hexContent, dataStart + i * 2, lut);
                    break;
                }
            }

            // Validate checksum
            int cksum = ParseByte(hexContent, dataStart + byteCount * 2, lut);
            int calc = (256 - (checksumCalc & 0xFF)) & 0xFF;
            if (calc != cksum)
                throw new FormatException($"Checksum mismatch at offset {lineStart}");

            // Advance past end of line
            pos = lineEnd;
        }

        return memory;
    }

    /// <summary>
    /// Parse two hex characters at the given offset into a byte value.
    /// Uses pre-built lookup table for speed in WASM.
    /// </summary>
    private static int ParseByte(string s, int offset, int[] lut)
    {
        int hi = s[offset];
        int lo = s[offset + 1];
        if (hi >= 128 || lo >= 128) throw new FormatException($"Invalid hex character at offset {offset}");
        int hv = lut[hi];
        int lv = lut[lo];
        if (hv < 0 || lv < 0) throw new FormatException($"Invalid hex character at offset {offset}");
        return (hv << 4) | lv;
    }
}
