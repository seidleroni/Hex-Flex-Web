

import { SEGMENT_GAP_THRESHOLD } from '../constants';
const DEFAULT_BLOCK_SIZE = 64 * 1024;

export class SparseMemory {
    private memoryBlocks: Map<number, (number | null)[]>;
    private readonly blockSize: number;
    private sortedKeys: number[] | null = null;

    constructor(blockSize: number = DEFAULT_BLOCK_SIZE) {
        if (blockSize <= 0) throw new Error("Block size must be positive.");
        this.blockSize = blockSize;
        this.memoryBlocks = new Map();
    }

    private getBlockKey(address: number): number {
        return Math.floor(address / this.blockSize) * this.blockSize;
    }

    private getOffset(address: number): number {
        return address % this.blockSize;
    }

    private invalidateSortedKeys() {
        this.sortedKeys = null;
    }

    private getSortedKeys(): number[] {
        if (!this.sortedKeys) {
            this.sortedKeys = Array.from(this.memoryBlocks.keys()).sort((a, b) => a - b);
        }
        return this.sortedKeys;
    }

    public setByte(address: number, value: number): void {
        const blockKey = this.getBlockKey(address);
        let block = this.memoryBlocks.get(blockKey);
        if (!block) {
            block = new Array(this.blockSize).fill(null);
            this.memoryBlocks.set(blockKey, block);
            this.invalidateSortedKeys();
        }
        const offset = this.getOffset(address);
        block[offset] = value;
    }

    public getByte(address: number): number | null {
        const blockKey = this.getBlockKey(address);
        const block = this.memoryBlocks.get(blockKey);
        if (block) {
            const offset = this.getOffset(address);
            return block[offset];
        }
        return null;
    }

    public getStartAddress(): number {
        if (this.memoryBlocks.size === 0) return 0;

        const sortedKeys = this.getSortedKeys();
        const firstBlockKey = sortedKeys[0];
        const block = this.memoryBlocks.get(firstBlockKey)!;

        for (let offset = 0; offset < this.blockSize; offset++) {
            if (block[offset] !== null) {
                return firstBlockKey + offset;
            }
        }
        
        // This should not be reached if there's data in the memory map
        return 0;
    }

    public getEndAddress(): number {
        if (this.memoryBlocks.size === 0) return 0;

        const sortedKeys = this.getSortedKeys();
        const lastBlockKey = sortedKeys[sortedKeys.length - 1];
        const block = this.memoryBlocks.get(lastBlockKey)!;

        for (let offset = this.blockSize - 1; offset >= 0; offset--) {
            if (block[offset] !== null) {
                return lastBlockKey + offset;
            }
        }

        // This should not be reached if there's data in the memory map
        return 0;
    }

    public getDataSize(): number {
        let count = 0;
        for (const block of this.memoryBlocks.values()) {
            for (const byte of block) {
                if (byte !== null) {
                    count++;
                }
            }
        }
        return count;
    }
    
    public isEmpty(): boolean {
        return this.memoryBlocks.size === 0;
    }

    public clear(): void {
        this.memoryBlocks.clear();
        this.invalidateSortedKeys();
    }

    public getMemoryBlocks(): Map<number, (number | null)[]> {
        return this.memoryBlocks;
    }
    
    public getBlockSize(): number {
        return this.blockSize;
    }

    /**
     * Identifies and merges contiguous regions of memory that contain "meaningful" data.
     * "Meaningful" data is defined as any byte that is not null and not 0xFF.
     * Gaps can be regions of null bytes, 0xFF bytes, or a combination of both.
     * @returns An array of segment objects, each with a start, end address, and size.
     */
    public getDataSegments(): { start: number; end: number; size: number }[] {
        if (this.isEmpty()) return [];

        const allSubSegments: { start: number; end: number }[] = [];
        const sortedKeys = this.getSortedKeys();

        // 1. Collect all "meaningful" sub-segments from each block.
        // A meaningful byte is not null and not 0xFF.
        for (const key of sortedKeys) {
            const block = this.memoryBlocks.get(key)!;
            let currentSubSegment: { start: number; end: number } | null = null;

            for (let offset = 0; offset < this.blockSize; offset++) {
                const byte = block[offset];
                const isMeaningfulByte = byte !== null && byte !== 0xFF;

                if (isMeaningfulByte) {
                    const addr = key + offset;
                    if (currentSubSegment === null) {
                        currentSubSegment = { start: addr, end: addr };
                    } else {
                        currentSubSegment.end = addr;
                    }
                } else { // This is a gap byte (null or 0xFF)
                    if (currentSubSegment !== null) {
                        // End of a sub-segment, push it and reset.
                        allSubSegments.push(currentSubSegment);
                        currentSubSegment = null;
                    }
                }
            }
            // If a sub-segment extends to the end of the block, push it.
            if (currentSubSegment !== null) {
                allSubSegments.push(currentSubSegment);
            }
        }
        
        if (allSubSegments.length === 0) return [];

        // 2. Merge the collected sub-segments into final segments based on SEGMENT_GAP_THRESHOLD.
        const segments: { start: number; end: number; size: number }[] = [];
        let currentSegment = { ...allSubSegments[0] };

        for (let i = 1; i < allSubSegments.length; i++) {
            const nextSubSegment = allSubSegments[i];
            const gapSize = nextSubSegment.start - currentSegment.end - 1;
            
            if (gapSize < SEGMENT_GAP_THRESHOLD) {
                // The gap is small, so merge this sub-segment into the current segment.
                currentSegment.end = nextSubSegment.end;
            } else {
                // The gap is large, so finalize the current segment and start a new one.
                segments.push({ ...currentSegment, size: currentSegment.end - currentSegment.start + 1 });
                currentSegment = { ...nextSubSegment };
            }
        }

        // Add the very last segment.
        segments.push({ ...currentSegment, size: currentSegment.end - currentSegment.start + 1 });

        return segments;
    }
}