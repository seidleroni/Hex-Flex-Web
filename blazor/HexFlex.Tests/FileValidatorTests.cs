using HexFlex.Blazor.Services;

namespace HexFlex.Tests;

public class FileValidatorTests
{
    [Fact]
    public void ValidHexContent_ReturnsTrue()
    {
        var content = ":0400000001020304F2\n:00000001FF\n";
        Assert.True(FileValidator.IsIntelHexContent(content));
    }

    [Fact]
    public void EmptyContent_ReturnsFalse()
    {
        Assert.False(FileValidator.IsIntelHexContent(""));
    }

    [Fact]
    public void NonHexContent_ReturnsFalse()
    {
        Assert.False(FileValidator.IsIntelHexContent("This is not a hex file\nNor is this\n"));
    }

    [Fact]
    public void MixedContent_FirstLineNotHex_ReturnsFalse()
    {
        Assert.False(FileValidator.IsIntelHexContent("not hex\n:0400000001020304F2\n"));
    }

    [Fact]
    public void OnlyBlankLines_ReturnsFalse()
    {
        Assert.False(FileValidator.IsIntelHexContent("\n\n\n"));
    }

    [Theory]
    [InlineData("package_complete_123.hex")]
    [InlineData("package_complete_v142.hex")]
    public void RealTestFiles_ValidateAsHex(string filename)
    {
        var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        var content = File.ReadAllText(Path.Combine(repoRoot, "test_files", filename));
        Assert.True(FileValidator.IsIntelHexContent(content));
    }
}
