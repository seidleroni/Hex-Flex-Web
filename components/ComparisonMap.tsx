import React, { useState, useMemo, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ComparisonMemory } from '../services/memoryComparer';
import { ComparisonMinimap } from './ComparisonMinimap';
import { VirtualDataRow } from '../types';
import { ROW_HEIGHT_PX } from '../constants';
import { formatHex } from '../utils';
import { VirtualizedHexView, type VirtualizedHexViewActions } from './shared/VirtualizedHexView';
import { DiffNavigator } from './comparison/DiffNavigator';
import { DiffHexByte } from './comparison/DiffHexByte';
import { DiffAsciiChar } from './comparison/DiffAsciiChar';

export interface ComparisonMapActions {
    goToAddress: (address: number) => void;
}

interface ComparisonMapProps {
    comparison: ComparisonMemory;
    onScrollUpdate: (activeSegmentIndex: number) => void;
}

export const ComparisonMap = forwardRef<ComparisonMapActions, ComparisonMapProps>(({ comparison, onScrollUpdate }, ref) => {
  const viewRef = useRef<VirtualizedHexViewActions>(null);
  const [viewportState, setViewportState] = useState({ scrollTop: 0, viewportHeight: 0 });
  const [highlightedDiffAddress, setHighlightedDiffAddress] = useState<number | null>(null);

  const memoizedData = useMemo(() => {
    const virtualRows = comparison.getVirtualRows();
    if (virtualRows.length === 0) return null;
    
    const totalRowCount = virtualRows.length;
    const height = totalRowCount * ROW_HEIGHT_PX;
    return { virtualRows, totalRowCount, totalHeight: height, diffAddresses: comparison.getDiffAddresses() };
  }, [comparison]);

  // Reset highlight when comparison data changes
  useEffect(() => {
    setHighlightedDiffAddress(null);
  }, [memoizedData]);

  const handleViewportChange = useCallback((newState: { scrollTop: number, viewportHeight: number }) => {
    setViewportState(newState);
  }, []);

  const handleNavigate = useCallback((newScrollTop: number) => {
    viewRef.current?.scrollTo(newScrollTop);
  }, []);

  useImperativeHandle(ref, () => ({
    goToAddress: (address: number) => {
        setHighlightedDiffAddress(null); // External navigation (e.g., segment click) clears the diff highlight.
        viewRef.current?.goToAddress(address); // Just scroll, don't highlight a specific byte.
    },
  }));

  const handleNextDiff = useCallback(() => {
    if (!memoizedData || memoizedData.diffAddresses.length === 0) return;
    const { diffAddresses } = memoizedData;
    const currentIndex = highlightedDiffAddress === null ? -1 : diffAddresses.indexOf(highlightedDiffAddress);
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < diffAddresses.length) {
        const nextAddress = diffAddresses[nextIndex];
        viewRef.current?.goToAddress(nextAddress, nextAddress);
        setHighlightedDiffAddress(nextAddress);
    }
  }, [highlightedDiffAddress, memoizedData]);

  const handlePreviousDiff = useCallback(() => {
    if (!memoizedData || memoizedData.diffAddresses.length === 0) return;
    const { diffAddresses } = memoizedData;
    const currentIndex = highlightedDiffAddress === null ? diffAddresses.length : diffAddresses.indexOf(highlightedDiffAddress);
    const prevIndex = currentIndex - 1;

    if (prevIndex >= 0) {
        const prevAddress = diffAddresses[prevIndex];
        viewRef.current?.goToAddress(prevAddress, prevAddress);
        setHighlightedDiffAddress(prevAddress);
    }
  }, [highlightedDiffAddress, memoizedData]);

  const renderDataRow = useCallback(({ row, isRowHighlighted, highlightedAddress, showAscii }: {
    row: VirtualDataRow;
    isRowHighlighted: boolean;
    highlightedAddress: number | null;
    showAscii: boolean;
  }) => {
      const rowAddress = row.address;
      const BYTES_PER_ROW = 16; // Defined locally as it's part of the rendering logic here
      const rowDiffs = Array.from({ length: BYTES_PER_ROW }, (_, j) => comparison.getDiffEntry(rowAddress + j));
      
      return (
          <tr key={rowAddress} className={`hover:bg-gray-700/50 ${isRowHighlighted ? 'row-highlight' : ''}`} style={{ height: `${ROW_HEIGHT_PX}px` }}>
              <td className="p-2 w-36 text-cyan-400 font-mono">{formatHex(rowAddress)}</td>
              <td className="p-2 font-mono tracking-wider space-x-1">
                  {rowDiffs.map((diff, idx) => {
                      const isHighlighted = highlightedAddress === (rowAddress + idx);
                      return <DiffHexByte key={idx} diff={diff} isHighlighted={isHighlighted} />;
                  })}
              </td>
              <td className={`p-2 w-44 font-mono ${!showAscii && 'hidden'}`}>
                  {rowDiffs.map((diff, idx) => {
                      const isHighlighted = highlightedAddress === (rowAddress + idx);
                      return <DiffAsciiChar key={idx} diff={diff} isHighlighted={isHighlighted} />;
                  })}
              </td>
          </tr>
      );
  }, [comparison]);


  if (!memoizedData) return <p className="text-center text-gray-400">No differences to display.</p>;
  
  const { diffAddresses } = memoizedData;
  const currentIndex = highlightedDiffAddress === null ? -1 : diffAddresses.indexOf(highlightedDiffAddress);
  const isPrevDisabled = currentIndex === 0;
  const isNextDisabled = currentIndex !== -1 && currentIndex === diffAddresses.length - 1;

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
                hexHeader="Data (Hex) - File B"
                asciiHeader="ASCII - File B"
                externalHighlightAddress={highlightedDiffAddress}
            />
            <ComparisonMinimap
                comparison={comparison}
                scrollTop={viewportState.scrollTop}
                totalHeight={memoizedData.totalHeight}
                viewportHeight={viewportState.viewportHeight}
                onNavigate={handleNavigate}
            />
            {diffAddresses.length > 0 && (
                <DiffNavigator onPrev={handlePreviousDiff} onNext={handleNextDiff} isPrevDisabled={isPrevDisabled} isNextDisabled={isNextDisabled} />
            )}
        </div>
    </div>
  );
});