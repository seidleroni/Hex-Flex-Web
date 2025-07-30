import React, { useRef, useEffect, useCallback } from 'react';
import { MINIMAP_VIEWPORT_FILL_COLOR, MINIMAP_VIEWPORT_BORDER_COLOR } from '../../constants';

// Safely gets the clientY from a MouseEvent or TouchEvent
const getEventClientY = (e: MouseEvent | TouchEvent): number | null => {
  if ('touches' in e) {
    if (e.touches.length > 0) return e.touches[0].clientY;
    if (e.changedTouches.length > 0) return e.changedTouches[0].clientY;
    return null;
  }
  return e.clientY;
};

interface GenericMinimapProps {
  scrollTop: number;
  totalHeight: number;
  viewportHeight: number;
  onNavigate: (newScrollTop: number) => void;
  drawData: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export const GenericMinimap: React.FC<GenericMinimapProps> = ({
  scrollTop,
  totalHeight,
  viewportHeight,
  onNavigate,
  drawData,
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
    if (height <= 0) return;

    // 1. Let the parent draw the data background
    drawData(ctx, width, height);

    // 2. Draw the viewport on top
    if (totalHeight > 0 && viewportHeight > 0) {
      const mapHeight = height;
      const viewportTop = (scrollTop / totalHeight) * mapHeight;
      const viewportHeightOnMap = (viewportHeight / totalHeight) * mapHeight;
      
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
  }, [drawData, scrollTop, totalHeight, viewportHeight]);
  
  // This effect synchronizes canvas resolution with its display size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
           canvas.width = width;
           canvas.height = height;
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
    <div className="w-6 flex-shrink-0 bg-gray-800 ml-1 cursor-pointer">
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