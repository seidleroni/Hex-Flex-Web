namespace HexFlex.Blazor.Services;

public static class FileValidator
{
    /// <summary>
    /// Quickly checks if file content is likely an Intel HEX file
    /// by inspecting the first few lines.
    /// </summary>
    public static bool IsIntelHexContent(string content)
    {
        if (string.IsNullOrEmpty(content)) return false;

        int checked_ = 0;
        int pos = 0;
        int len = content.Length;

        while (pos < len && checked_ < Constants.ValidatorSampleLines)
        {
            // Skip whitespace/newlines to find line start
            while (pos < len && (content[pos] == '\n' || content[pos] == '\r' || content[pos] == ' ' || content[pos] == '\t'))
                pos++;

            if (pos >= len) break;

            // Non-empty line — must start with ':'
            if (content[pos] != ':') return false;
            checked_++;

            // Advance to end of line
            while (pos < len && content[pos] != '\n')
                pos++;
        }

        return checked_ > 0;
    }
}
