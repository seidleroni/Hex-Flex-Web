import React, { useRef, useEffect, useCallback } from 'react';
import type { SparseMemory } from '../services/sparseMemory';
import type { VirtualRow } from '../types';
import { 
    BYTES_PER_ROW,
    MINIMAP_DATA_COLOR,
    MINIMAP_EMPTY_COLOR,
    MINIMAP_ERASED_COLOR,
    MINIMAP_GAP_COLOR,
    MINIMAP_VIEWPORT_FILL_COLOR,
    MINIMAP_VIEWPORT_BORDER_COLOR
} from '../constants';

// Safely gets the clientY from a MouseEvent or TouchEvent
const getEventClientY = (e: MouseEvent | TouchEvent): number | null => {
  if ('touches' in e) {
    if (e.touches.length > 0) return e.touches[0].clientY;
    if (e.changedTouches.length > 0) return e.changedTouches[0].clientY;
    return null;
  }
  return e.clientY;
};

export const MemoryMinimap: React.FC<{
  memory: SparseMemory;
  virtualRows: VirtualRow[];
  scrollTop: number;
  totalHeight: number;
  viewportHeight: number;
  onNavigate: (newScrollTop: number) => void;
}> = ({
  memory,
  virtualRows,
  scrollTop,
  totalHeight,
  viewportHeight,
  onNavigate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (memory.isEmpty() || height <= 0 || !virtualRows || virtualRows.length === 0) return;

    const totalRowCount = virtualRows.length;
    const rowsPerPixelY = totalRowCount / height;

    for (let y = 0; y < height; y++) {
      const startVRowIndex = Math.floor(y * rowsPerPixelY);
      const endVRowIndex = Math.max(startVRowIndex + 1, Math.floor((y + 1) * rowsPerPixelY));

      const pixelSummary = { hasData: false, hasGap: false, hasErased: false };

      // Iterate over all virtual rows that this single pixel represents
      for (let i = startVRowIndex; i < endVRowIndex && i < totalRowCount; i++) {
        const vRow = virtualRows[i];
        if (!vRow) continue;

        if (vRow.type === 'gap') {
          // A VirtualGapRow is created for very large empty/erased spaces.
          // We can sample the first byte to guess the gap's nature.
          if (memory.getByte(vRow.startAddress) === 0xFF) {
              pixelSummary.hasErased = true;
          } else {
              pixelSummary.hasGap = true;
          }
          continue;
        }

        // This code only runs for 'data' vRows.
        // Check if the row contains data, is purely erased, or just empty.
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
                    break; // Data has priority within a row.
                }
            }
        }
        
        if (isRowData) {
            pixelSummary.hasData = true;
        } else if (hasContent && isRowErased) {
            // This row is purely 0xFF bytes (or a mix of 0xFF and null).
            pixelSummary.hasErased = true;
        }
      }
      
      // Set color based on priority: Data > Erased > Gap > Empty
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
    
    if (totalHeight > 0 && viewportHeight > 0) {
      const mapHeight = height;
      const viewportTop = (scrollTop / totalHeight) * mapHeight;
      const viewportHeightOnMap = (viewportHeight / totalHeight) * mapHeight;
      
      // Draw high-contrast viewport
      ctx.fillStyle = MINIMAP_VIEWPORT_FILL_COLOR;
      ctx.strokeStyle = MINIMAP_VIEWPORT_BORDER_COLOR;
      ctx.lineWidth = 1;

      const rectToDraw = {
        x: 0.5,
        y: viewportTop + 0.5,
        w: width -1,
        h: Math.max(2, viewportHeightOnMap) -1
      };

      ctx.fillRect(rectToDraw.x, rectToDraw.y, rectToDraw.w, rectToDraw.h);
      ctx.strokeRect(rectToDraw.x, rectToDraw.y, rectToDraw.w, rectToDraw.h);
    }
  }, [memory, virtualRows, scrollTop, totalHeight, viewportHeight]);

  // This effect synchronizes canvas resolution with its display size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Check to prevent excessive redraws if size is 0
        if (width > 0 && height > 0) {
           canvas.width = width;
           canvas.height = height;
           // Redraw after resizing
           drawMinimap();
        }
      }
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [drawMinimap]);


  const handleInteractionStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || totalHeight <= viewportHeight) return;

    const nativeEvent = e.nativeEvent;
    nativeEvent.preventDefault();
    isDraggingRef.current = true;

    const startY = getEventClientY(nativeEvent);
    if (startY === null) return;
    
    const rect = canvas.getBoundingClientRect();
    const mapHeight = canvas.clientHeight;
    
    const thumbHeight = (viewportHeight / totalHeight) * mapHeight;
    const thumbTop = (scrollTop / totalHeight) * mapHeight;
    const clickYOnMap = startY - rect.top;

    if(clickYOnMap >= thumbTop && clickYOnMap <= thumbTop + thumbHeight) {
        dragOffsetRef.current = clickYOnMap - thumbTop;
    } else {
        dragOffsetRef.current = thumbHeight / 2;
    }
    
    const newScrollTopRatio = (clickYOnMap - dragOffsetRef.current) / mapHeight;
    const newScrollTop = Math.max(0, Math.min(newScrollTopRatio * totalHeight, totalHeight - viewportHeight));
    onNavigate(newScrollTop);

  }, [onNavigate, totalHeight, viewportHeight, scrollTop]);

  useEffect(() => {
    const handleInteractionMove = (e: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        e.preventDefault();

        const moveY = getEventClientY(e);
        if (moveY === null) return;
        
        const rect = canvas.getBoundingClientRect();
        const clickYOnMap = moveY - rect.top;
        const mapHeight = canvas.clientHeight;

        const newScrollTopRatio = (clickYOnMap - dragOffsetRef.current) / mapHeight;
        const newScrollTop = newScrollTopRatio * totalHeight;
        
        onNavigate(Math.max(0, Math.min(newScrollTop, totalHeight - viewportHeight)));
    };
    
    const handleInteractionEnd = () => {
        isDraggingRef.current = false;
        dragOffsetRef.current = 0;
    };

    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('touchmove', handleInteractionMove, { passive: false });
    window.addEventListener('mouseup', handleInteractionEnd);
    window.addEventListener('touchend', handleInteractionEnd);

    return () => {
        window.removeEventListener('mousemove', handleInteractionMove);
        window.removeEventListener('touchmove', handleInteractionMove);
        window.removeEventListener('mouseup', handleInteractionEnd);
        window.removeEventListener('touchend', handleInteractionEnd);
    };
  }, [onNavigate, totalHeight, viewportHeight]);

  return (
    <div className="w-6 bg-gray-800 ml-1 cursor-pointer">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleInteractionStart}
        onTouchStart={handleInteractionStart}
        aria-label="Interactive memory map navigator"
      />
    </div>
  );
};