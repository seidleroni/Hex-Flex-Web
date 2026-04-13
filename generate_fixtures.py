"""Generate ground-truth parsing fixtures from Python intelhex library.

Produces JSON fixtures for:
- Each test hex file: segments, addresses, data sizes, spot-check bytes
- Comparison between the two test files: byte-level diff stats
"""

import json
import os
import sys
from pathlib import Path
from intelhex import IntelHex

TEST_FILES_DIR = Path("test_files")
OUTPUT_DIR = Path("test_output/fixtures")

# Gap threshold matching the React app's segment detection
SEGMENT_GAP_THRESHOLD = 1024


def detect_segments(ih: IntelHex) -> list[dict]:
    """Detect segments using intelhex's built-in segment detection."""
    # intelhex.segments() returns list of (start, end) tuples
    # where end is exclusive (first address after the segment)
    raw_segments = ih.segments()

    # Now merge segments that are within SEGMENT_GAP_THRESHOLD of each other
    # (intelhex reports every contiguous block, but we use a 1KB gap threshold)
    if not raw_segments:
        return []

    merged = [list(raw_segments[0])]
    for start, end in raw_segments[1:]:
        prev_end = merged[-1][1]
        if start - prev_end <= SEGMENT_GAP_THRESHOLD:
            # Merge with previous
            merged[-1][1] = end
        else:
            merged.append([start, end])

    segments = []
    for start, end in merged:
        # end is exclusive in intelhex, so last address is end-1
        last = end - 1
        segments.append({
            "start": start,
            "end": last,
            "size": end - start,
            "start_hex": f"0x{start:08X}",
            "end_hex": f"0x{last:08X}",
        })
    return segments


def parse_hex_file(filepath: Path) -> dict:
    """Parse a hex file and extract ground-truth data."""
    print(f"  Loading {filepath.name}...", flush=True)
    ih = IntelHex(str(filepath))

    print("  Analyzing...", flush=True)
    min_addr = ih.minaddr()
    max_addr = ih.maxaddr()
    addresses = ih.addresses()
    total_data_bytes = len(list(addresses))

    print(f"  {total_data_bytes:,} data bytes", flush=True)

    segments = detect_segments(ih)

    # --- Spot checks: comprehensive byte-level validation ---
    # Categories: boundary, stride, alignment, ELA-transition, gap-edge, wrap, value-class
    spot_checks = []
    raw_segs = ih.segments()  # raw contiguous sub-segments from intelhex
    addr_set = set(ih.addresses())

    def add_check(addr, category):
        if addr in addr_set:
            spot_checks.append({
                "address": addr,
                "address_hex": f"0x{addr:08X}",
                "value": ih[addr],
                "category": category,
            })

    for seg in segments:
        # EASY: first and last 32 bytes of each logical segment
        for offset in range(min(32, seg["size"])):
            add_check(seg["start"] + offset, "segment_start")
            add_check(seg["end"] - offset, "segment_end")

        # MEDIUM: every 1KB stride through the segment for broad coverage
        stride = 1024
        addr = seg["start"]
        while addr <= seg["end"]:
            for offset in [0, 1, 7, 15]:  # check aligned + odd offsets at each stride
                add_check(addr + offset, "stride_1kb")
            addr += stride

        # MEDIUM: mid-segment sample (exact midpoint + neighbors)
        mid = (seg["start"] + seg["end"]) // 2
        for offset in range(-8, 9):
            add_check(mid + offset, "mid_segment")

        # MEDIUM: non-16-byte-aligned addresses (odd row offsets)
        for frac in [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9]:
            base = seg["start"] + int(seg["size"] * frac)
            for offset in [0, 3, 5, 11, 13]:  # deliberately non-aligned
                add_check(base + offset, "non_aligned")

    # HARD: bytes right after each Extended Linear Address change
    # ELA records set the upper 16 bits, so transitions happen at 0x____0000 boundaries
    # Check bytes on both sides of each ELA boundary within our data
    ela_boundaries = set()
    for seg_start, seg_end in raw_segs:
        # The ELA block boundary for this segment's start
        ela_base = seg_start & 0xFFFF0000
        ela_boundaries.add(ela_base)
        # Also check if segment spans an ELA boundary
        next_ela = ela_base + 0x10000
        while next_ela < seg_end:
            ela_boundaries.add(next_ela)
            next_ela += 0x10000

    for ela in sorted(ela_boundaries):
        for offset in [-2, -1, 0, 1, 2, 15, 16]:
            add_check(ela + offset, "ela_boundary")

    # HARD: bytes near 0xFFFF offset within each ELA block (16-bit address wrap area)
    for seg_start, seg_end in raw_segs:
        ela_base = seg_start & 0xFFFF0000
        wrap_addr = ela_base + 0xFFFF
        if seg_start <= wrap_addr <= seg_end:
            for offset in range(-16, 17):
                add_check(wrap_addr + offset, "address_wrap")

    # HARD: gap edges — last byte before each gap, first byte after
    for i in range(len(raw_segs) - 1):
        _, end_a = raw_segs[i]
        start_b, _ = raw_segs[i + 1]
        # end_a is exclusive in intelhex, so last byte is end_a - 1
        for offset in range(min(16, end_a - raw_segs[i][0])):
            add_check(end_a - 1 - offset, "pre_gap")
        for offset in range(min(16, raw_segs[i + 1][1] - start_b)):
            add_check(start_b + offset, "post_gap")

    # MEDIUM: collect samples of specific byte values (0x00, 0xFF, other)
    # These can trip up parsers that confuse data 0xFF with "erased"
    found_00 = 0
    found_ff = 0
    for seg_start, seg_end in raw_segs:
        size = seg_end - seg_start
        arr = ih.tobinarray(start=seg_start, size=size)
        for i, val in enumerate(arr):
            addr = seg_start + i
            if val == 0x00 and found_00 < 20:
                add_check(addr, "value_0x00")
                found_00 += 1
            elif val == 0xFF and found_ff < 20:
                add_check(addr, "value_0xFF")
                found_ff += 1

    # Deduplicate (same address may appear in multiple categories)
    seen = {}
    deduped = []
    for check in spot_checks:
        addr = check["address"]
        if addr not in seen:
            seen[addr] = check
            deduped.append(check)
        else:
            # Merge categories
            existing = seen[addr]
            if check["category"] not in existing["category"]:
                existing["category"] += "," + check["category"]
    spot_checks = deduped
    print(f"  {len(spot_checks)} spot-check bytes across {len(set(c['category'].split(',')[0] for c in spot_checks))} categories", flush=True)

    result = {
        "filename": filepath.name,
        "min_address": min_addr,
        "max_address": max_addr,
        "min_address_hex": f"0x{min_addr:08X}",
        "max_address_hex": f"0x{max_addr:08X}",
        "total_data_bytes": total_data_bytes,
        "segment_count": len(segments),
        "segments": segments,
        "spot_checks": spot_checks,
    }

    # Save full binary dump: for each intelhex segment, dump contiguous bytes
    print("  Saving binary byte dump...", flush=True)
    bin_path = OUTPUT_DIR / f"{filepath.stem}_bytes.bin"
    raw_segments = ih.segments()
    with open(bin_path, "wb") as f:
        # Header: number of raw segments
        seg_count = len(raw_segments)
        f.write(seg_count.to_bytes(4, "little"))
        for start, end in raw_segments:
            size = end - start
            f.write(start.to_bytes(4, "little"))
            f.write(size.to_bytes(4, "little"))
            arr = ih.tobinarray(start=start, size=size)
            f.write(bytes(arr))
    print(f"  -> {bin_path} ({os.path.getsize(bin_path) / 1024:.0f} KB)", flush=True)

    return result


def compare_files(filepath_a: Path, filepath_b: Path) -> dict:
    """Compare two hex files byte-by-byte and compute diff statistics."""
    print(f"  Loading files...", flush=True)
    ih_a = IntelHex(str(filepath_a))
    ih_b = IntelHex(str(filepath_b))

    addrs_a = set(ih_a.addresses())
    addrs_b = set(ih_b.addresses())

    only_a = addrs_a - addrs_b  # removed
    only_b = addrs_b - addrs_a  # added
    common = addrs_a & addrs_b

    print(f"  A: {len(addrs_a):,}, B: {len(addrs_b):,}, common: {len(common):,}", flush=True)

    # For common addresses, check modified vs unchanged
    # Use segment-based iteration for speed
    modified = 0
    unchanged = 0
    sample_modified = []

    segs_a = ih_a.segments()
    segs_b = ih_b.segments()

    # Build a dict of B's data for quick lookup at common addresses
    # Use segment arrays for efficiency
    print("  Computing diffs...", flush=True)
    for seg_start, seg_end in segs_a:
        size = seg_end - seg_start
        arr_a = ih_a.tobinarray(start=seg_start, size=size)
        for i in range(size):
            addr = seg_start + i
            if addr in common:
                val_a = arr_a[i]
                val_b = ih_b[addr]
                if val_a == val_b:
                    unchanged += 1
                else:
                    modified += 1
                    if len(sample_modified) < 50:
                        sample_modified.append({
                            "address": addr,
                            "address_hex": f"0x{addr:08X}",
                            "value_a": int(val_a),
                            "value_b": int(val_b),
                        })

    removed = len(only_a)
    added = len(only_b)

    # Sample removed/added
    sample_removed = []
    for addr in sorted(only_a)[:50]:
        sample_removed.append({
            "address": addr,
            "address_hex": f"0x{addr:08X}",
            "value": ih_a[addr],
        })

    sample_added = []
    for addr in sorted(only_b)[:50]:
        sample_added.append({
            "address": addr,
            "address_hex": f"0x{addr:08X}",
            "value": ih_b[addr],
        })

    return {
        "file_a": filepath_a.name,
        "file_b": filepath_b.name,
        "total_addresses": len(addrs_a | addrs_b),
        "unchanged": unchanged,
        "modified": modified,
        "added": added,
        "removed": removed,
        "sample_modified": sample_modified,
        "sample_added": sample_added,
        "sample_removed": sample_removed,
    }


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    hex_files = sorted(TEST_FILES_DIR.glob("*.hex"))
    if not hex_files:
        print("ERROR: No hex files found in test_files/", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(hex_files)} hex files\n")

    for hf in hex_files:
        print(f"Parsing {hf.name}...")
        data = parse_hex_file(hf)

        outpath = OUTPUT_DIR / f"{hf.stem}_ground_truth.json"
        with open(outpath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"  -> {outpath}")
        print(f"     Data bytes: {data['total_data_bytes']:,}")
        print(f"     Segments: {data['segment_count']}")
        print(f"     Address range: {data['min_address_hex']} - {data['max_address_hex']}")
        for seg in data["segments"]:
            print(f"       {seg['start_hex']} - {seg['end_hex']} ({seg['size']:,} bytes)")
        print()

    if len(hex_files) == 2:
        print(f"Comparing {hex_files[0].name} vs {hex_files[1].name}...")
        comparison = compare_files(hex_files[0], hex_files[1])
        comp_path = OUTPUT_DIR / "comparison_ground_truth.json"
        with open(comp_path, "w") as f:
            json.dump(comparison, f, indent=2)
        print(f"  -> {comp_path}")
        print(f"     Total addresses: {comparison['total_addresses']:,}")
        print(f"     Unchanged: {comparison['unchanged']:,}")
        print(f"     Modified:  {comparison['modified']:,}")
        print(f"     Added:     {comparison['added']:,}")
        print(f"     Removed:   {comparison['removed']:,}")

    print("\nDone!")


if __name__ == "__main__":
    main()
