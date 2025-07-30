import React, { useCallback } from 'react';
import type { ComparisonMemory } from '../services/memoryComparer';
import { DiffType } from '../types';
import { 
    BYTES_PER_ROW,
    MINIMAP_EMPTY_COLOR,
    MINIMAP_DATA_COLOR,
    MINIMAP_ERASED_COLOR,
    MINIMAP_GAP_COLOR,
    DIFF_MODIFIED_MARKER,
    DIFF_ADDED_MARKER,
    DIFF_REMOVED_MARKER,
} from '../constants';
import { GenericMinimap } from './shared/GenericMinimap';

interface ComparisonMinimapProps {
  comparison: ComparisonMemory;
  scrollTop: number;
  totalHeight: number;
  viewportHeight: number;
  onNavigate: (newScrollTop: number) => void;
}

export const ComparisonMinimap: React.FC<ComparisonMinimapProps> = ({
  comparison,
  scrollTop,
  totalHeight,
  viewportHeight,
  onNavigate,
}) => {
  const drawData = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const virtualRows = comparison.getVirtualRows();
    const totalRowCount = virtualRows.length;
    
    if (totalRowCount <= 0 || height <= 0) return;
    
    const rowsPerPixel = totalRowCount / height;

    for (let y = 0; y < height; y++) {
      const startVRowIndex = Math.floor(y * rowsPerPixel);
      const endVRowIndex = Math.max(startVRowIndex + 1, Math.floor((y + 1) * rowsPerPixel));
      
      const pixelSummary = { hasModified: false, hasAdded: false, hasRemoved: false, hasData: false, hasGap: false, hasErased: false };

      for (let i = startVRowIndex; i < endVRowIndex && i < virtualRows.length; i++) {
        const vRow = virtualRows[i];
        if (!vRow) continue;

        if (vRow.type === 'gap') {
          pixelSummary.hasGap = true;
          continue;
        }

        for (let j = 0; j < BYTES_PER_ROW; j++) {
          const entry = comparison.getDiffEntry(vRow.address + j);

          switch (entry.type) {
            case DiffType.Modified: pixelSummary.hasModified = true; break;
            case DiffType.Added:   pixelSummary.hasAdded = true; break;
            case DiffType.Removed: pixelSummary.hasRemoved = true; break;
            case DiffType.Unchanged:
              if (entry.byteA !== null) {
                  if (entry.byteA === 0xFF) {
                      pixelSummary.hasErased = true;
                  } else {
                      pixelSummary.hasData = true;
                  }
              }
              break;
          }
        }
        if (pixelSummary.hasModified) break;
      }
      
      if (pixelSummary.hasModified) {
        ctx.fillStyle = DIFF_MODIFIED_MARKER;
      } else if (pixelSummary.hasAdded) {
        ctx.fillStyle = DIFF_ADDED_MARKER;
      } else if (pixelSummary.hasRemoved) {
        ctx.fillStyle = DIFF_REMOVED_MARKER;
      } else if (pixelSummary.hasData) {
        ctx.fillStyle = MINIMAP_DATA_COLOR;
      } else if (pixelSummary.hasErased) {
        ctx.fillStyle = MINIMAP_ERASED_COLOR;
      } else if (pixelSummary.hasGap) {
        ctx.fillStyle = MINIMAP_GAP_COLOR;
      } else {
        ctx.fillStyle = MINIMAP_EMPTY_COLOR;
      }
      ctx.fillRect(0, y, width, 1);
    }
  }, [comparison]);

  return (
    <GenericMinimap
        scrollTop={scrollTop}
        totalHeight={totalHeight}
        viewportHeight={viewportHeight}
        onNavigate={onNavigate}
        drawData={drawData}
    />
  );
};