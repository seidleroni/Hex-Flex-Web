
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { SparseMemory } from '../services/sparseMemory';
import { MemoryMinimap } from './MemoryMinimap';

interface MemoryMapProps {
  memory: SparseMemory;
}

const BYTES_PER_ROW = 16;
const EMPTY_BYTE_HEX_PLACEHOLDER = '--';
const ROW_HEIGHT_PX = 36;
const BUFFER_ROWS = 10;

const formatHex = (n: number, padding: number = 8) => `0x${n.toString(16).toUpperCase().padStart(padding, '0')}`;
const formatByte = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
const toAscii = (n: number) => (n >= 32 && n <= 126) ? String.fromCharCode(n) : '.';

// A component for a single styled byte in the hex view
const HexByte: React.FC<{ byte: number | null }> = React.memo(({ byte }) => {
  if (byte === null) {
    return <span className="text-gray-600">{EMPTY_BYTE_HEX_PLACEHOLDER}</span>;
  }
  // All bytes now have the same color.
  return <span className="text-gray-300">{formatByte(byte)}</span>;
});

// A component for a single styled character in the ASCII view
const AsciiChar: React.FC<{ byte: number | null }> = React.memo(({ byte }) => {
    if (byte === null) return <span> </span>;
      
    const isPrintable = byte >= 32 && byte <= 126;
    // Printable characters are yellow, non-printable are a muted gray.
    const colorClass = isPrintable ? 'text-yellow-300' : 'text-gray-600';

    return <span className={colorClass}>{toAscii(byte)}</span>;
});


export const MemoryMap: React.FC<MemoryMapProps> = ({ memory }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const memoizedData = useMemo(() => {
    if (memory.isEmpty()) {
      return null;
    }
    const start = memory.getStartAddress();
    const end = memory.getEndAddress();
    
    if (end < start) { 
        return null;
    }

    const count = Math.ceil((end - start + 1) / BYTES_PER_ROW);
    const height = count * ROW_HEIGHT_PX;
    return { globalStart: start, globalEnd: end, totalRowCount: count, totalHeight: height };
  }, [memory]);

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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const handleNavigate = useCallback((newScrollTop: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = newScrollTop;
    }
  }, []);

  if (!memoizedData) {
    return <p className="text-center text-gray-400">No memory segments to display.</p>;
  }

  const { globalStart, globalEnd, totalRowCount, totalHeight } = memoizedData;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - BUFFER_ROWS);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + 2 * BUFFER_ROWS;
  const endIndex = Math.min(totalRowCount, startIndex + visibleRowCount);
  const paddingTop = startIndex * ROW_HEIGHT_PX;

  const visibleRows = [];
  for (let i = startIndex; i < endIndex; i++) {
    const rowAddress = globalStart + (i * BYTES_PER_ROW);
    if (rowAddress > globalEnd + 1) continue;

    const rowBytes = Array.from({ length: BYTES_PER_ROW }, (_, j) => memory.getByte(rowAddress + j));

    visibleRows.push(
      <tr key={rowAddress} className="hover:bg-gray-700/50" style={{ height: `${ROW_HEIGHT_PX}px` }}>
        <td className="p-2 w-36 text-cyan-400 font-mono">{formatHex(rowAddress)}</td>
        <td className="p-2 font-mono tracking-wider space-x-2">
            {rowBytes.map((byte, idx) => <HexByte key={idx} byte={byte} />)}
        </td>
        <td className="p-2 w-44 font-mono">
            {rowBytes.map((byte, idx) => <AsciiChar key={idx} byte={byte} />)}
        </td>
      </tr>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-lg shadow-xl backdrop-blur-sm border border-gray-700 flex flex-col overflow-hidden">
      <div className="text-gray-400 bg-gray-800/80 backdrop-blur-sm z-10 flex-shrink-0 border-b border-gray-700">
        <table className="w-full text-sm text-left table-fixed">
          <thead>
            <tr>
              <th className="p-2 w-36 font-semibold">Address</th>
              <th className="p-2 font-semibold">Data (Hex)</th>
              <th className="p-2 w-44 font-semibold">ASCII</th>
            </tr>
          </thead>
        </table>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="overflow-auto max-h-[65vh] relative flex-1 no-scrollbar"
          aria-label="Memory Map"
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            <table className="w-full text-sm text-left table-fixed" style={{ transform: `translateY(${paddingTop}px)`, position: 'absolute', top: 0, left: 0, width: '100%' }}>
              <tbody className="text-gray-200 divide-y divide-gray-700/50">
                {visibleRows}
              </tbody>
            </table>
          </div>
        </div>
        <MemoryMinimap
          memory={memory}
          scrollTop={scrollTop}
          totalHeight={totalHeight}
          viewportHeight={viewportHeight}
          onNavigate={handleNavigate}
        />
      </div>
    </div>
  );
};