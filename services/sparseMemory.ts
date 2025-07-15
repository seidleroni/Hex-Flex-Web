

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
     * Identifies and merges contiguous regions of memory that contain data.
     * @returns An array of segment objects, each with a start, end address, and size.
     */
    public getDataSegments(): { start: number; end: number; size: number }[] {
        if (this.isEmpty()) return [];

        const segments: { start: number; end: number; size: number }[] = [];
        const sortedKeys = this.getSortedKeys();

        let currentSegment: { start: number; end: number } | null = null;

        for (const key of sortedKeys) {
            const block = this.memoryBlocks.get(key)!;
            let firstDataInBlock = -1;
            let lastDataInBlock = -1;

            for (let i = 0; i < this.blockSize; i++) {
                if (block[i] !== null) {
                    if (firstDataInBlock === -1) {
                        firstDataInBlock = key + i;
                    }
                    lastDataInBlock = key + i;
                }
            }

            if (firstDataInBlock !== -1) { // If block has data
                if (currentSegment === null) {
                    // Start a new segment
                    currentSegment = { start: firstDataInBlock, end: lastDataInBlock };
                } else {
                    // Check if this block is contiguous with the current segment, allowing for small gaps.
                    const gapSize = firstDataInBlock - currentSegment.end - 1;
                    if (gapSize < SEGMENT_GAP_THRESHOLD) {
                        currentSegment.end = lastDataInBlock;
                    } else {
                        // The gap is large enough. Finalize the old segment and start a new one.
                        segments.push({ ...currentSegment, size: currentSegment.end - currentSegment.start + 1 });
                        currentSegment = { start: firstDataInBlock, end: lastDataInBlock };
                    }
                }
            }
        }

        if (currentSegment !== null) {
            segments.push({ ...currentSegment, size: currentSegment.end - currentSegment.start + 1 });
        }

        return segments;
    }
}