import React, { useState, useMemo, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { SparseMemory } from '../services/sparseMemory';
import type { VirtualRow } from '../types';
import { MemoryMinimap } from './MemoryMinimap';
import { BYTES_PER_ROW, EMPTY_BYTE_HEX_PLACEHOLDER, ROW_HEIGHT_PX, BUFFER_ROWS, VIEW_GAP_THRESHOLD } from '../constants';
import { formatHex, formatBytes } from '../utils';

const formatByte = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
const toAscii = (n: number) => (n >= 32 && n <= 126) ? String.fromCharCode(n) : '.';

// A component for a single styled byte in the hex view
const HexByte: React.FC<{ byte: number | null; isHighlighted?: boolean }> = React.memo(({ byte, isHighlighted }) => {
  const baseClasses = "px-1 rounded"; // Consistent padding for all bytes to prevent layout shift

  if (isHighlighted) {
    return (
        <span className={`${baseClasses} bg-cyan-400 text-gray-900 font-bold`}>
            {byte === null ? EMPTY_BYTE_HEX_PLACEHOLDER : formatByte(byte)}
        </span>
    );
  }
  
  if (byte === null) {
    return <span className={`${baseClasses} text-gray-600`}>{EMPTY_BYTE_HEX_PLACEHOLDER}</span>;
  }
  return <span className={`${baseClasses} text-gray-300`}>{formatByte(byte)}</span>;
});

// A component for a single styled character in the ASCII view
const AsciiChar: React.FC<{ byte: number | null; isHighlighted?: boolean }> = React.memo(({ byte, isHighlighted }) => {
    const baseClasses = "px-0.5 rounded"; // Consistent padding

    if (isHighlighted) {
        return (
            <span className={`${baseClasses} bg-cyan-400 text-gray-900 font-bold`}>
                {toAscii(byte)}
            </span>
        );
    }
    
    if (byte === null) return <span className={baseClasses}> </span>;
      
    const isPrintable = byte >= 32 && byte <= 126;
    const colorClass = isPrintable ? 'text-yellow-300' : 'text-gray-600';

    return <span className={`${baseClasses} ${colorClass}`}>{toAscii(byte)}</span>;
});

// A component to display a collapsed gap in the memory map
const GapRow: React.FC<{ row: VirtualRow & { type: 'gap' }; showAscii: boolean }> = React.memo(({ row, showAscii }) => (
    <tr style={{ height: `${ROW_HEIGHT_PX}px` }}>
        <td colSpan={showAscii ? 3 : 2} className="text-center py-1">
            <div 
              className="inline-block w-full" 
              title={`Skipped addresses from ${formatHex(row.startAddress)} to ${formatHex(row.endAddress)}`}
            >
                <span className="font-mono text-xs text-gray-500 tracking-wider bg-gray-900/50 px-4 py-1.5 rounded-full border border-dashed border-gray-700">
                    ... GAP: {formatBytes(row.skippedBytes)} SKIPPED ...
                </span>
            </div>
        </td>
    </tr>
));

export interface MemoryMapActions {
    goToAddress: (address: number) => void;
}

interface MemoryMapProps {
    memory: SparseMemory;
    onScrollUpdate: (activeSegmentIndex: number) => void;
}

export const MemoryMap = forwardRef<MemoryMapActions, MemoryMapProps>(({ memory, onScrollUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [highlightedRowStart, setHighlightedRowStart] = useState<number | null>(null);
  const [highlightedByteAddress, setHighlightedByteAddress] = useState<number | null>(null);
  const lastReportedSegmentIndex = useRef<number | null>(null);
  const [showAscii, setShowAscii] = useState(true);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const threshold = 680; // pixels, chosen to give enough space for hex data
        setShowAscii(entry.contentRect.width > threshold);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const memoizedData = useMemo(() => {
    if (memory.isEmpty()) return null;

    const dataSegments = memory.getDataSegments();
    if (dataSegments.length === 0) return null;

    const virtualRows: VirtualRow[] = [];
    const firstSegment = dataSegments[0];
    let lastRowAddress = Math.floor(firstSegment.start / BYTES_PER_ROW) * BYTES_PER_ROW - BYTES_PER_ROW;

    dataSegments.forEach((segment, segmentIndex) => {
      const gapStart = lastRowAddress + BYTES_PER_ROW;
      const currentStartRow = Math.floor(segment.start / BYTES_PER_ROW) * BYTES_PER_ROW;
      const gapSize = currentStartRow - gapStart;

      if (gapSize > VIEW_GAP_THRESHOLD) {
        virtualRows.push({
          type: 'gap',
          skippedBytes: gapSize,
          startAddress: gapStart,
          endAddress: currentStartRow - 1,
          segmentIndex: segmentIndex,
        });
      } else if (gapSize > 0) {
        for (let addr = gapStart; addr < currentStartRow; addr += BYTES_PER_ROW) {
          virtualRows.push({ type: 'data', address: addr, segmentIndex });
        }
      }

      const segmentEndRow = Math.floor(segment.end / BYTES_PER_ROW) * BYTES_PER_ROW;
      for (let addr = currentStartRow; addr <= segmentEndRow; addr += BYTES_PER_ROW) {
        virtualRows.push({ type: 'data', address: addr, segmentIndex });
      }
      lastRowAddress = segmentEndRow;
    });

    const totalRowCount = virtualRows.length;
    const height = totalRowCount * ROW_HEIGHT_PX;
    return { virtualRows, totalRowCount, totalHeight: height };
  }, [memory]);

    // Effect to report the current segment based on scroll position
    useEffect(() => {
        if (!memoizedData || !scrollContainerRef.current) return;
        const { virtualRows, totalRowCount } = memoizedData;
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

    }, [scrollTop, memoizedData, onScrollUpdate]);

    // Reset last reported index when file changes
    useEffect(() => {
        lastReportedSegmentIndex.current = null;
    }, [memoizedData]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    
    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(scrollContainer.clientHeight);
    });
    resizeObserver.observe(scrollContainer);
    setViewportHeight(scrollContainer.clientHeight);

    return () => resizeObserver.disconnect();
  }, [memoizedData]);

  useEffect(() => {
    setScrollTop(0);
    if(scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
    }
  }, [memoizedData]);
  
  const handleNavigate = useCallback((newScrollTop: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = newScrollTop;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    goToAddress: (address: number) => {
        if (!memoizedData) return;
        const { virtualRows } = memoizedData;

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
                setHighlightedRowStart(targetRow.address);
                setHighlightedByteAddress(address);
                setTimeout(() => {
                    setHighlightedRowStart(null);
                    setHighlightedByteAddress(null);
                }, 2000);
            }
        }
    }
  }), [memoizedData, handleNavigate]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  if (!memoizedData) {
    return <p className="text-center text-gray-400">No memory segments to display.</p>;
  }

  const { virtualRows, totalRowCount, totalHeight } = memoizedData;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - BUFFER_ROWS);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + 2 * BUFFER_ROWS;
  const endIndex = Math.min(totalRowCount, startIndex + visibleRowCount);
  const paddingTop = startIndex * ROW_HEIGHT_PX;

  const visibleRenderedRows = [];
  for (let i = startIndex; i < endIndex; i++) {
    const row = virtualRows[i];
    if (row.type === 'gap') {
        visibleRenderedRows.push(<GapRow key={`gap-${row.startAddress}`} row={row} showAscii={showAscii} />);
    } else {
        const rowAddress = row.address;
        const rowBytes = Array.from({ length: BYTES_PER_ROW }, (_, j) => memory.getByte(rowAddress + j));
        const isRowHighlighted = highlightedRowStart === rowAddress;

        visibleRenderedRows.push(
          <tr key={rowAddress} className={`hover:bg-gray-700/50 ${isRowHighlighted ? 'row-highlight' : ''}`} style={{ height: `${ROW_HEIGHT_PX}px` }}>
            <td className="p-2 w-36 text-cyan-400 font-mono">{formatHex(rowAddress)}</td>
            <td className="p-2 font-mono tracking-wider space-x-1">
                {rowBytes.map((byte, idx) => {
                    const currentByteAddress = rowAddress + idx;
                    const isByteHighlighted = isRowHighlighted && highlightedByteAddress === currentByteAddress;
                    return <HexByte key={idx} byte={byte} isHighlighted={isByteHighlighted} />;
                })}
            </td>
            <td className={`p-2 w-44 font-mono ${!showAscii && 'hidden'}`}>
                {rowBytes.map((byte, idx) => {
                    const currentByteAddress = rowAddress + idx;
                    const isByteHighlighted = isRowHighlighted && highlightedByteAddress === currentByteAddress;
                    return <AsciiChar key={idx} byte={byte} isHighlighted={isByteHighlighted} />;
                })}
            </td>
          </tr>
        );
    }
  }

  return (
    <div ref={containerRef} className="bg-gray-800/50 rounded-lg shadow-xl backdrop-blur-sm border border-gray-700 flex flex-col overflow-hidden flex-grow">
      <div className="text-gray-400 bg-gray-800/80 backdrop-blur-sm z-10 flex-shrink-0 border-b border-gray-700">
        <table className="w-full text-sm text-left table-fixed">
          <thead>
            <tr>
              <th className="p-2 w-36 font-semibold">Address</th>
              <th className="p-2 font-semibold">Data (Hex)</th>
              <th className={`p-2 w-44 font-semibold ${!showAscii && 'hidden'}`}>ASCII</th>
            </tr>
          </thead>
        </table>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
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
        <MemoryMinimap
          memory={memory}
          virtualRows={virtualRows}
          scrollTop={scrollTop}
          totalHeight={totalHeight}
          viewportHeight={viewportHeight}
          onNavigate={handleNavigate}
        />
      </div>
    </div>
  );
});