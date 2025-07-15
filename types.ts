import type { SparseMemory } from './services/sparseMemory';
import type { ComparisonMemory } from './services/memoryComparer';

export type ViewMode = 'single' | 'compare';

export interface MemoryStats {
  startAddress: number;
  endAddress: number;
  dataSize: number;
}

export interface FileState {
  memory: SparseMemory | null;
  fileName: string;
  error: string | null;
  isLoading: boolean;
}

export interface ComparisonState {
  fileA: FileState;
  fileB: FileState;
}

// Types for Comparison Feature
export enum DiffType {
  Unchanged,
  Modified,
  Added,
  Removed,
}

export interface DiffEntry {
  type: DiffType;
  byteA: number | null; // Value from File A
  byteB: number | null; // Value from File B
}

export interface DiffStats {
  modified: number;
  added: number;
  removed: number;
}

// Types for Virtualized Rendering (for large gaps)
export interface VirtualDataRow {
  type: 'data';
  address: number;
  segmentIndex: number;
}
export interface VirtualGapRow {
  type: 'gap';
  skippedBytes: number;
  startAddress: number;
  endAddress: number;
  segmentIndex: number; // Index of the segment *after* this gap
}
export type VirtualRow = VirtualDataRow | VirtualGapRow;