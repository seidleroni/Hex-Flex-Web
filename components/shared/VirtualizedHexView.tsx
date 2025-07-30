import React, { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { VirtualRow, VirtualDataRow } from '../../types';
import { ROW_HEIGHT_PX, BUFFER_ROWS, BYTES_PER_ROW } from '../../constants';
import { GapRow } from './GapRow';

export interface VirtualizedHexViewActions {
  goToAddress: (address: number, highlightedByte?: number | null) => void;
  scrollTo: (scrollTop: number) => void;
}

interface VirtualizedHexViewProps {
  virtualRows: VirtualRow[];
  totalRowCount: number;
  totalHeight: number;
  onScrollUpdate: (activeSegmentIndex: number) => void;
  onViewportChange: (viewport: { scrollTop: number; viewportHeight: number }) => void;
  renderDataRow: (props: { row: VirtualDataRow; isRowHighlighted: boolean; highlightedAddress: number | null; showAscii: boolean; }) => React.ReactElement;
  hexHeader: string;
  asciiHeader: string;
  externalHighlightAddress?: number | null;
}

export const VirtualizedHexView = forwardRef<VirtualizedHexViewActions, VirtualizedHexViewProps>(({
  virtualRows,
  totalRowCount,
  totalHeight,
  onScrollUpdate,
  onViewportChange,
  renderDataRow,
  hexHeader,
  asciiHeader,
  externalHighlightAddress,
}, ref) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [showAscii, setShowAscii] = useState(true);
  const [internalHighlightedRowStart, setInternalHighlightedRowStart] = useState<number | null>(null);
  const [internalHighlightedByteAddress, setInternalHighlightedByteAddress] = useState<number | null>(null);
  const lastReportedSegmentIndex = useRef<number | null>(null);

  useEffect(() => {
    const element = scrollContainerRef.current?.parentElement; // Observe the parent container for width changes
    if (!element) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const threshold = 680;
        setShowAscii(entry.contentRect.width > threshold);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    if (totalRowCount === 0) return;

    const currentVirtualRowIndex = Math.min(
        totalRowCount - 1,
        Math.floor(scrollTop / ROW_HEIGHT_PX)
    );
    const currentRow = virtualRows[currentVirtualRowIndex];
    
    if (currentRow && currentRow.segmentIndex !== lastReportedSegmentIndex.current) {
        onScrollUpdate(currentRow.segmentIndex);
        lastReportedSegmentIndex.current = currentRow.segmentIndex;
    }
  }, [scrollTop, virtualRows, totalRowCount, onScrollUpdate]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    
    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(scrollContainer.clientHeight);
    });
    resizeObserver.observe(scrollContainer);
    setViewportHeight(scrollContainer.clientHeight);

    return () => resizeObserver.disconnect();
  }, [virtualRows]);

  useEffect(() => {
    setScrollTop(0);
    if(scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
    }
    lastReportedSegmentIndex.current = null;
  }, [virtualRows]);

  useEffect(() => {
    onViewportChange({ scrollTop, viewportHeight });
  }, [scrollTop, viewportHeight, onViewportChange]);
  
  const handleNavigate = useCallback((newScrollTop: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = newScrollTop;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    scrollTo: (newScrollTop: number) => {
        handleNavigate(newScrollTop);
    },
    goToAddress: (address: number, highlightedByte?: number | null) => {
        let finalIndex = virtualRows.findIndex(row => {
            if (row.type === 'data') {
                return address >= row.address && address < row.address + BYTES_PER_ROW;
            }
            if (row.type === 'gap') {
                return address >= row.startAddress && address <= row.endAddress;
            }
            return false;
        });
        
        if (finalIndex === -1) {
            const targetRowAddress = Math.floor(address / BYTES_PER_ROW) * BYTES_PER_ROW;
            finalIndex = virtualRows.findIndex(row => row.type === 'data' && row.address === targetRowAddress);
        }

        if (finalIndex !== -1) {
            const newScrollTop = finalIndex * ROW_HEIGHT_PX;
            handleNavigate(newScrollTop);
            
            const targetRow = virtualRows[finalIndex];
            if (targetRow.type === 'data') {
                setInternalHighlightedRowStart(targetRow.address);
                if (highlightedByte !== undefined) {
                    setInternalHighlightedByteAddress(highlightedByte);
                }
                setTimeout(() => {
                    setInternalHighlightedRowStart(null);
                    setInternalHighlightedByteAddress(null);
                }, 2000);
            }
        }
    }
  }), [virtualRows, handleNavigate]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - BUFFER_ROWS);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + 2 * BUFFER_ROWS;
  const endIndex = Math.min(totalRowCount, startIndex + visibleRowCount);
  const paddingTop = startIndex * ROW_HEIGHT_PX;

  const highlightedAddress = externalHighlightAddress ?? internalHighlightedByteAddress;

  const visibleRenderedRows = [];
  for (let i = startIndex; i < endIndex; i++) {
    const row = virtualRows[i];
    if (row.type === 'gap') {
        visibleRenderedRows.push(<GapRow key={`gap-${row.startAddress}`} row={row} showAscii={showAscii} />);
    } else {
        const isRowHighlighted = internalHighlightedRowStart === row.address;
        visibleRenderedRows.push(renderDataRow({ 
          row, 
          isRowHighlighted, 
          highlightedAddress,
          showAscii,
        }));
    }
  }

  return (
    <div className="flex flex-col overflow-hidden flex-grow">
      <div className="text-gray-400 bg-gray-800/80 backdrop-blur-sm z-10 flex-shrink-0 border-b border-gray-700">
        <table className="w-full text-sm text-left table-fixed">
          <thead>
            <tr>
              <th className="p-2 w-36 font-semibold">Address</th>
              <th className="p-2 font-semibold">{hexHeader}</th>
              <th className={`p-2 w-44 font-semibold ${!showAscii && 'hidden'}`}>{asciiHeader}</th>
            </tr>
          </thead>
        </table>
      </div>
      
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-auto relative flex-1 no-scrollbar"
        aria-label="Memory Map"
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          <table className="w-full text-sm text-left table-fixed" style={{ transform: `translateY(${paddingTop}px)`, position: 'absolute', top: 0, left: 0, width: '100%' }}>
            <tbody className="text-gray-200 divide-y divide-gray-700/50">
              {visibleRenderedRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});