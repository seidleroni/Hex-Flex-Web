namespace HexFlex.Blazor.Services;

/// <summary>
/// Shared constants used across the application.
/// JS-side equivalents are defined at the top of each JS file and must be kept in sync.
/// </summary>
public static class Constants
{
    /// <summary>Maximum allowed upload file size (10 MB).</summary>
    public const long MaxFileSize = 10 * 1024 * 1024;

    /// <summary>Row height in pixels for the virtual hex viewer.</summary>
    public const int RowHeightPx = 28;

    /// <summary>Number of hex bytes displayed per row.</summary>
    public const int BytesPerRow = 16;

    /// <summary>Number of buffer rows rendered above/below the viewport.</summary>
    public const int BufferRows = 15;

    /// <summary>Maximum number of rows rendered in a single frame.</summary>
    public const int MaxRenderRows = 200;

    /// <summary>Gaps larger than this (1 MB) are collapsed to a single row in the viewer.</summary>
    public const long ViewGapThreshold = 0x100000;

    /// <summary>Footer height in pixels, used for layout calculations.</summary>
    public const int FooterHeightPx = 50;

    /// <summary>Number of lines the file validator inspects.</summary>
    public const int ValidatorSampleLines = 5;
}
