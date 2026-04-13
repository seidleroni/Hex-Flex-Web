using HexFlex.Blazor.Services;

namespace HexFlex.Tests;

public class SparseMemoryTests
{
    [Fact]
    public void SetAndGetByte_RoundTrips()
    {
        var mem = new SparseMemory();
        mem.SetByte(0x08000000, 0xAB);
        Assert.Equal((byte)0xAB, mem.GetByte(0x08000000));
    }

    [Fact]
    public void GetByte_UnsetAddress_ReturnsNull()
    {
        var mem = new SparseMemory();
        Assert.Null(mem.GetByte(0x08000000));
    }

    [Fact]
    public void GetStartAddress_ReturnsFirstSetByte()
    {
        var mem = new SparseMemory();
        mem.SetByte(100, 0x01);
        mem.SetByte(50, 0x02);
        mem.SetByte(200, 0x03);
        Assert.Equal(50L, mem.GetStartAddress());
    }

    [Fact]
    public void GetEndAddress_ReturnsLastSetByte()
    {
        var mem = new SparseMemory();
        mem.SetByte(100, 0x01);
        mem.SetByte(50, 0x02);
        mem.SetByte(200, 0x03);
        Assert.Equal(200L, mem.GetEndAddress());
    }

    [Fact]
    public void GetDataSize_CountsOnlySetBytes()
    {
        var mem = new SparseMemory();
        mem.SetByte(0, 0x01);
        mem.SetByte(100, 0x02);
        mem.SetByte(200, 0x03);
        Assert.Equal(3L, mem.GetDataSize());
    }

    [Fact]
    public void IsEmpty_NewMemory_True()
    {
        Assert.True(new SparseMemory().IsEmpty);
    }

    [Fact]
    public void IsEmpty_AfterSetByte_False()
    {
        var mem = new SparseMemory();
        mem.SetByte(0, 0x01);
        Assert.False(mem.IsEmpty);
    }

    [Fact]
    public void Clear_ResetsEverything()
    {
        var mem = new SparseMemory();
        mem.SetByte(0, 0x01);
        mem.Clear();
        Assert.True(mem.IsEmpty);
        Assert.Null(mem.GetByte(0));
    }

    [Fact]
    public void GetDataSegments_SingleContiguousBlock_OneSegment()
    {
        var mem = new SparseMemory();
        for (int i = 0; i < 256; i++)
            mem.SetByte(0x08000000 + i, (byte)(i & 0x7F)); // non-0xFF values

        var segs = mem.GetDataSegments();
        Assert.Single(segs);
        Assert.Equal(0x08000000L, segs[0].Start);
        Assert.Equal(0x080000FFL, segs[0].End);
    }

    [Fact]
    public void GetDataSegments_TwoBlocks_WithLargeGap_TwoSegments()
    {
        var mem = new SparseMemory();
        // First block
        for (int i = 0; i < 16; i++)
            mem.SetByte(0x08000000 + i, 0x01);
        // Second block, >1KB gap
        for (int i = 0; i < 16; i++)
            mem.SetByte(0x08002000 + i, 0x02);

        var segs = mem.GetDataSegments();
        Assert.Equal(2, segs.Count);
        Assert.Equal(0x08000000L, segs[0].Start);
        Assert.Equal(0x08002000L, segs[1].Start);
    }

    [Fact]
    public void GetDataSegments_TwoBlocks_WithSmallGap_MergedIntoOne()
    {
        var mem = new SparseMemory();
        // First block
        for (int i = 0; i < 16; i++)
            mem.SetByte(0x08000000 + i, 0x01);
        // Second block, <1KB gap (only 512 bytes away)
        for (int i = 0; i < 16; i++)
            mem.SetByte(0x08000200 + i, 0x02);

        var segs = mem.GetDataSegments();
        Assert.Single(segs);
    }

    [Fact]
    public void GetDataSegments_OnlyFFBytes_NoSegments()
    {
        var mem = new SparseMemory();
        for (int i = 0; i < 16; i++)
            mem.SetByte(i, 0xFF);

        var segs = mem.GetDataSegments();
        Assert.Empty(segs);
    }

    [Fact]
    public void GetDataSegments_Empty_ReturnsEmpty()
    {
        Assert.Empty(new SparseMemory().GetDataSegments());
    }

    [Fact]
    public void SetByte_OverwritesPreviousValue()
    {
        var mem = new SparseMemory();
        mem.SetByte(42, 0x01);
        mem.SetByte(42, 0x02);
        Assert.Equal((byte)0x02, mem.GetByte(42));
    }

    [Fact]
    public void LargeAddress_WorksCorrectly()
    {
        var mem = new SparseMemory();
        long addr = 0x081FFC00;
        mem.SetByte(addr, 0xDE);
        Assert.Equal((byte)0xDE, mem.GetByte(addr));
        Assert.Equal(addr, mem.GetStartAddress());
        Assert.Equal(addr, mem.GetEndAddress());
    }
}
