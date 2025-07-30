import React, { useCallback } from 'react';
import type { SparseMemory } from '../services/sparseMemory';
import type { VirtualRow } from '../types';
import { 
    BYTES_PER_ROW,
    MINIMAP_DATA_COLOR,
    MINIMAP_EMPTY_COLOR,
    MINIMAP_ERASED_COLOR,
    MINIMAP_GAP_COLOR,
} from '../constants';
import { GenericMinimap } from './shared/GenericMinimap';

interface MemoryMinimapProps {
  memory: SparseMemory;
  virtualRows: VirtualRow[];
  scrollTop: number;
  totalHeight: number;
  viewportHeight: number;
  onNavigate: (newScrollTop: number) => void;
}

export const MemoryMinimap: React.FC<MemoryMinimapProps> = ({
  memory,
  virtualRows,
  scrollTop,
  totalHeight,
  viewportHeight,
  onNavigate,
}) => {
  const drawData = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (memory.isEmpty() || height <= 0 || !virtualRows || virtualRows.length === 0) return;

    const totalRowCount = virtualRows.length;
    const rowsPerPixelY = totalRowCount / height;

    for (let y = 0; y < height; y++) {
      const startVRowIndex = Math.floor(y * rowsPerPixelY);
      const endVRowIndex = Math.max(startVRowIndex + 1, Math.floor((y + 1) * rowsPerPixelY));

      const pixelSummary = { hasData: false, hasGap: false, hasErased: false };

      for (let i = startVRowIndex; i < endVRowIndex && i < totalRowCount; i++) {
        const vRow = virtualRows[i];
        if (!vRow) continue;

        if (vRow.type === 'gap') {
          if (memory.getByte(vRow.startAddress) === 0xFF) {
              pixelSummary.hasErased = true;
          } else {
              pixelSummary.hasGap = true;
          }
          continue;
        }

        let isRowData = false;
        let isRowErased = false;
        let hasContent = false;
        
        for (let addr = vRow.address; addr < vRow.address + BYTES_PER_ROW; addr++) {
            const byte = memory.getByte(addr);
            if (byte !== null) {
                hasContent = true;
                if (byte === 0xFF) {
                    isRowErased = true;
                } else {
                    isRowData = true;
                    break; 
                }
            }
        }
        
        if (isRowData) {
            pixelSummary.hasData = true;
        } else if (hasContent && isRowErased) {
            pixelSummary.hasErased = true;
        }
      }
      
      if (pixelSummary.hasData) {
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
  }, [memory, virtualRows]);

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