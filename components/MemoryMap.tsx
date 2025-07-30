import React, { useState, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import type { SparseMemory } from '../services/sparseMemory';
import type { VirtualRow, VirtualDataRow } from '../types';
import { MemoryMinimap } from './MemoryMinimap';
import { BYTES_PER_ROW, ROW_HEIGHT_PX, VIEW_GAP_THRESHOLD } from '../constants';
import { formatHex } from '../utils';
import { VirtualizedHexView, type VirtualizedHexViewActions } from './shared/VirtualizedHexView';
import { ViewHexByte } from './view/ViewHexByte';
import { ViewAsciiChar } from './view/ViewAsciiChar';

export interface MemoryMapActions {
    goToAddress: (address: number) => void;
}

interface MemoryMapProps {
    memory: SparseMemory;
    onScrollUpdate: (activeSegmentIndex: number) => void;
}

export const MemoryMap = forwardRef<MemoryMapActions, MemoryMapProps>(({ memory, onScrollUpdate }, ref) => {
  const viewRef = useRef<VirtualizedHexViewActions>(null);
  const [viewportState, setViewportState] = useState({ scrollTop: 0, viewportHeight: 0 });

  useImperativeHandle(ref, () => ({
    goToAddress: (address: number) => {
        // Highlight both the row and the specific byte
        viewRef.current?.goToAddress(address, address);
    }
  }), []);

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

  const handleViewportChange = useCallback((newState: { scrollTop: number, viewportHeight: number }) => {
    setViewportState(newState);
  }, []);
  
  const handleNavigate = useCallback((newScrollTop: number) => {
    viewRef.current?.scrollTo(newScrollTop);
  }, []);

  const renderDataRow = useCallback(({ row, isRowHighlighted, highlightedAddress, showAscii }: {
    row: VirtualDataRow;
    isRowHighlighted: boolean;
    highlightedAddress: number | null;
    showAscii: boolean;
  }) => {
    const rowAddress = row.address;
    const rowBytes = Array.from({ length: BYTES_PER_ROW }, (_, j) => memory.getByte(rowAddress + j));
    
    return (
      <tr key={rowAddress} className={`hover:bg-gray-700/50 ${isRowHighlighted ? 'row-highlight' : ''}`} style={{ height: `${ROW_HEIGHT_PX}px` }}>
        <td className="p-2 w-36 text-cyan-400 font-mono">{formatHex(rowAddress)}</td>
        <td className="p-2 font-mono tracking-wider space-x-1">
            {rowBytes.map((byte, idx) => {
                const currentByteAddress = rowAddress + idx;
                const isByteHighlighted = highlightedAddress === currentByteAddress;
                return <ViewHexByte key={idx} byte={byte} isHighlighted={isByteHighlighted} />;
            })}
        </td>
        <td className={`p-2 w-44 font-mono ${!showAscii && 'hidden'}`}>
            {rowBytes.map((byte, idx) => {
                const currentByteAddress = rowAddress + idx;
                const isByteHighlighted = highlightedAddress === currentByteAddress;
                return <ViewAsciiChar key={idx} byte={byte} isHighlighted={isByteHighlighted} />;
            })}
        </td>
      </tr>
    );
  }, [memory]);

  if (!memoizedData) {
    return <p className="text-center text-gray-400">No memory segments to display.</p>;
  }

  return (
    <div className="bg-gray-800/50 rounded-lg shadow-xl backdrop-blur-sm border border-gray-700 flex flex-col overflow-hidden flex-grow">
      <div className="flex flex-1 overflow-hidden">
        <VirtualizedHexView
            ref={viewRef}
            virtualRows={memoizedData.virtualRows}
            totalRowCount={memoizedData.totalRowCount}
            totalHeight={memoizedData.totalHeight}
            onScrollUpdate={onScrollUpdate}
            onViewportChange={handleViewportChange}
            renderDataRow={renderDataRow}
            hexHeader="Data (Hex)"
            asciiHeader="ASCII"
        />
        <MemoryMinimap
          memory={memory}
          virtualRows={memoizedData.virtualRows}
          scrollTop={viewportState.scrollTop}
          totalHeight={memoizedData.totalHeight}
          viewportHeight={viewportState.viewportHeight}
          onNavigate={handleNavigate}
        />
      </div>
    </div>
  );
});