namespace HexFlex.Blazor.Services;

public static class FileValidator
{
    /// <summary>
    /// Quickly checks if file content is likely an Intel HEX file
    /// by inspecting the first few lines.
    /// </summary>
    public static bool IsIntelHexContent(string content)
    {
        var lines = content.Split('\n');
        int checked_ = 0;

        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd('\r').Trim();
            if (string.IsNullOrEmpty(line)) continue;
            if (!line.StartsWith(':')) return false;
            checked_++;
            if (checked_ >= Constants.ValidatorSampleLines) break;
        }

        return checked_ > 0;
    }
}
