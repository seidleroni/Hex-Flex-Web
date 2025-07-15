import { SparseMemory } from './sparseMemory';
import { DiffType, type DiffEntry, type DiffStats, type VirtualRow, type VirtualDataRow, type VirtualGapRow } from '../types';
import { BYTES_PER_ROW, SEGMENT_GAP_THRESHOLD } from '../constants';

export class ComparisonMemory {
  private diffMap: Map<number, DiffEntry> = new Map();
  private stats: DiffStats = { modified: 0, added: 0, removed: 0 };
  private virtualRows: VirtualRow[] = [];
  private readonly defaultEntry: DiffEntry = { type: DiffType.Unchanged, byteA: null, byteB: null };
  private diffAddresses: number[] | null = null;

  constructor(memoryA: SparseMemory, memoryB: SparseMemory) {
    const blocksA = memoryA.getMemoryBlocks();
    const blocksB = memoryB.getMemoryBlocks();
    const allBlockKeys = new Set([...blocksA.keys(), ...blocksB.keys()]);
    const blockSize = memoryA.getBlockSize(); // Assumes both memories use the same block size

    for (const blockKey of allBlockKeys) {
        const blockA = blocksA.get(blockKey);
        const blockB = blocksB.get(blockKey);

        for (let offset = 0; offset < blockSize; offset++) {
            const byteA = blockA?.[offset] ?? null;
            const byteB = blockB?.[offset] ?? null;

            // Only process if there is data in at least one file for this address
            if (byteA === null && byteB === null) {
                continue;
            }

            const addr = blockKey + offset;
            let type: DiffType;

            if (byteA === byteB) {
              type = DiffType.Unchanged;
            } else if (byteA === null && byteB !== null) {
              type = DiffType.Added;
              this.stats.added++;
            } else if (byteA !== null && byteB === null) {
              type = DiffType.Removed;
              this.stats.removed++;
            } else { // byteA !== null && byteB !== null && byteA !== byteB
              type = DiffType.Modified;
              this.stats.modified++;
            }
            
            this.diffMap.set(addr, { type, byteA, byteB });
        }
    }

    this._buildVirtualRows();
  }

  private _buildVirtualRows() {
    this.virtualRows = []; // Clear previous rows
    const addressesWithData = Array.from(this.diffMap.keys()).sort((a, b) => a - b);
    if (addressesWithData.length === 0) {
        return;
    }

    const sortedRowAddresses = Array.from(new Set(addressesWithData.map(addr => Math.floor(addr / BYTES_PER_ROW) * BYTES_PER_ROW))).sort((a,b) => a - b);

    if (sortedRowAddresses.length === 0) return;

    // A visual gap row is created for any non-contiguous data rows
    const VISUAL_GAP_THRESHOLD_BYTES = BYTES_PER_ROW;
    let segmentIndex = 0;

    let lastRowAddress = sortedRowAddresses[0];
    this.virtualRows.push({ type: 'data', address: lastRowAddress, segmentIndex });

    for (let i = 1; i < sortedRowAddresses.length; i++) {
        const currentRowAddress = sortedRowAddresses[i];
        const gap = currentRowAddress - lastRowAddress;

        // A new segment is created only if the gap between data rows is large enough
        if (gap >= SEGMENT_GAP_THRESHOLD) {
            segmentIndex++;
        }

        // A visual gap row is created for any non-contiguous data rows
        if (gap > VISUAL_GAP_THRESHOLD_BYTES) {
            const skippedBytes = gap - BYTES_PER_ROW;
            const gapStart = lastRowAddress + BYTES_PER_ROW;
            const gapEnd = currentRowAddress - 1;
            this.virtualRows.push({ type: 'gap', skippedBytes, startAddress: gapStart, endAddress: gapEnd, segmentIndex });
        }
        this.virtualRows.push({ type: 'data', address: currentRowAddress, segmentIndex });
        lastRowAddress = currentRowAddress;
    }
  }

  public getDiffEntry(address: number): DiffEntry {
    return this.diffMap.get(address) ?? this.defaultEntry;
  }
  
  public getStats(): DiffStats {
    return this.stats;
  }

  public getVirtualRows(): VirtualRow[] {
    return this.virtualRows;
  }
  
  public getDiffAddresses(): number[] {
    if (this.diffAddresses === null) {
      const addresses: number[] = [];
      for (const [addr, diff] of this.diffMap.entries()) {
        if (diff.type !== DiffType.Unchanged) {
          addresses.push(addr);
        }
      }
      this.diffAddresses = addresses.sort((a, b) => a - b);
    }
    return this.diffAddresses;
  }

  public isEmpty(): boolean {
      // It's empty if there are no differences and no data rows to show.
      return this.virtualRows.length === 0 && this.stats.added === 0 && this.stats.modified === 0 && this.stats.removed === 0;
  }

  public getDataSegments(): { start: number; end: number; size: number }[] {
    if (this.virtualRows.length === 0) return [];

    const segmentsMap = new Map<number, { start: number; end: number }>();

    for (const vRow of this.virtualRows) {
        if (vRow.type === 'data') {
            const segment = segmentsMap.get(vRow.segmentIndex);
            if (!segment) {
                // First row of a new segment
                segmentsMap.set(vRow.segmentIndex, { start: vRow.address, end: vRow.address });
            } else {
                // Update the end address for the segment
                segment.end = vRow.address;
            }
        }
    }

    const segments: { start: number; end: number; size: number }[] = [];
    const sortedSegmentIndices = Array.from(segmentsMap.keys()).sort((a, b) => a - b);
    
    for (const index of sortedSegmentIndices) {
        const segmentRange = segmentsMap.get(index)!;
        // The end address of the segment is the end of the last row in it
        const endAddress = segmentRange.end + BYTES_PER_ROW - 1;
        segments.push({
            start: segmentRange.start,
            end: endAddress,
            size: endAddress - segmentRange.start + 1,
        });
    }

    return segments;
  }
}

export const compareMemory = (memoryA: SparseMemory, memoryB: SparseMemory): ComparisonMemory => {
  return new ComparisonMemory(memoryA, memoryB);
};