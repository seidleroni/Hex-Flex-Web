namespace HexFlex.Blazor.Services;

public static class FileValidator
{
    /// <summary>
    /// Quickly checks if file content is likely an Intel HEX file
    /// by inspecting the first few non-blank lines (ASCII byte view).
    /// </summary>
    public static bool IsIntelHexContent(ReadOnlySpan<byte> content)
    {
        if (content.Length == 0) return false;

        int checked_ = 0;
        int pos = 0;
        int len = content.Length;

        while (pos < len && checked_ < Constants.ValidatorSampleLines)
        {
            // Skip whitespace/newlines to find line start
            while (pos < len && (content[pos] == (byte)'\n' || content[pos] == (byte)'\r' || content[pos] == (byte)' ' || content[pos] == (byte)'\t'))
                pos++;

            if (pos >= len) break;

            // Non-empty line — must start with ':'
            if (content[pos] != (byte)':') return false;
            checked_++;

            // Advance to end of line
            while (pos < len && content[pos] != (byte)'\n')
                pos++;
        }

        return checked_ > 0;
    }

    /// <summary>
    /// Convenience overload for callers that already have the content as a string.
    /// </summary>
    public static bool IsIntelHexContent(string content)
    {
        if (string.IsNullOrEmpty(content)) return false;
        return IsIntelHexContent(System.Text.Encoding.ASCII.GetBytes(content).AsSpan());
    }
}
