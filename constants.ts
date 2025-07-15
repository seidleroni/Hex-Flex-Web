export const BYTES_PER_ROW = 16;
export const EMPTY_BYTE_HEX_PLACEHOLDER = '--';
export const ROW_HEIGHT_PX = 36;
export const BUFFER_ROWS = 10;
export const MINIMAP_WIDTH = 24;

// Threshold for collapsing empty regions in the single file view
export const SINGLE_VIEW_GAP_THRESHOLD = 0x100000; // 1MB

// The minimum size of an empty memory region to be considered a "gap" that separates two data segments.
export const SEGMENT_GAP_THRESHOLD = 1024; // 1KB

// Colors for Minimap
export const MINIMAP_DATA_COLOR = '#22d3ee'; // cyan-400
export const MINIMAP_EMPTY_COLOR = '#374151'; // gray-700
export const MINIMAP_GAP_COLOR = '#8b5cf6'; // violet-500
export const MINIMAP_VIEWPORT_FILL_COLOR = 'rgba(34, 211, 238, 0.5)';
export const MINIMAP_VIEWPORT_BORDER_COLOR = 'rgba(207, 250, 254, 1)';

// Colors for Comparison Diff View
export const DIFF_MODIFIED_BG = 'rgba(250, 204, 21, 0.3)'; // yellow-400 with opacity
export const DIFF_ADDED_BG = 'rgba(74, 222, 128, 0.3)'; // green-400 with opacity
export const DIFF_REMOVED_BG = 'rgba(248, 113, 113, 0.3)'; // red-400 with opacity

export const DIFF_MODIFIED_MARKER = '#facc15'; // yellow-400
export const DIFF_ADDED_MARKER = '#4ade80'; // green-400
export const DIFF_REMOVED_MARKER = '#f87171'; // red-400