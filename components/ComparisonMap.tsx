import React, { useState, useMemo, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ComparisonMemory } from '../services/memoryComparer';
import { ComparisonMinimap } from './ComparisonMinimap';
import { GoToNextIcon, GoToPreviousIcon } from './Icons';
import { DiffType, DiffEntry, VirtualRow } from '../types';
import { 
    BYTES_PER_ROW, EMPTY_BYTE_HEX_PLACEHOLDER, ROW_HEIGHT_PX, BUFFER_ROWS, 
    DIFF_MODIFIED_BG, DIFF_ADDED_BG, DIFF_REMOVED_BG
} from '../constants';
import { formatHex, formatBytes } from '../utils';

const formatByte = (n: number | null) => n === null ? EMPTY_BYTE_HEX_PLACEHOLDER : n.toString(16).toUpperCase().padStart(2, '0');
const toAscii = (n: number | null) => (n !== null && n >= 32 && n <= 126) ? String.fromCharCode(n) : '.';

const getDiffStyle = (type: DiffType): React.CSSProperties => {
  switch (type) {
    case DiffType.Modified: return { backgroundColor: DIFF_MODIFIED_BG };
    case DiffType.Added:    return { backgroundColor: DIFF_ADDED_BG };
    case DiffType.Removed:  return { backgroundColor: DIFF_REMOVED_BG };
    default: return {};
  }
};

const HexByte: React.FC<{ diff: DiffEntry; isHighlighted: boolean; }> = React.memo(({ diff, isHighlighted }) => {
  const byteToShow = diff.byteB ?? diff.byteA;
  const highlightClass = isHighlighted ? 'cell-highlight' : '';

  let textClass: string;
  switch (diff.type) {
    case DiffType.Modified:
      textClass = 'text-yellow-300 font-bold';
      break;
    case DiffType.Added:
      textClass = 'text-green-300 font-bold';
      break;
    case DiffType.Removed:
      textClass = 'text-gray-600 line-through';
      break;
    default:
      textClass = 'text-gray-300';
  }

  return (
    <span style={getDiffStyle(diff.type)} className={`px-0.5 rounded ${textClass} ${highlightClass}`}>
      {formatByte(byteToShow)}
    </span>
  );
});

const AsciiChar: React.FC<{ diff: DiffEntry; isHighlighted: boolean; }> = React.memo(({ diff, isHighlighted }) => {
  const style = getDiffStyle(diff.type);
  const highlightClass = isHighlighted ? 'cell-highlight' : '';

  // Handle Modified separately to show the 'after' state, now with bold font for emphasis.
  if (diff.type === DiffType.Modified) {
    return (
        <span style={style} className={`px-0.5 rounded text-yellow-300 font-bold ${highlightClass}`}>
            {toAscii(diff.byteB)}
        </span>
    );
  }
  
  const byteToShow = diff.byteB ?? diff.byteA;
  const isPrintable = byteToShow !== null && byteToShow >= 32 && byteToShow <= 126;
  let colorClass: string;

  switch (diff.type) {
    case DiffType.Added:
      // Added bytes are green and bold.
      colorClass = isPrintable ? 'text-green-300 font-bold' : 'text-gray-600';
      break;
    case DiffType.Removed:
      // Removed bytes are struck through.
      colorClass = 'text-gray-600 line-through';
      break;
    case DiffType.Unchanged:
    default:
      // Unchanged bytes match the single-file view styling (yellow for printable).
      colorClass = isPrintable ? 'text-yellow-300' : 'text-gray-600';
      break;
  }

  return (
    <span style={style} className={`px-0.5 rounded ${colorClass} ${highlightClass}`}>
      {toAscii(byteToShow)}
    </span>
  );
});

const GapRow: React.FC<{ row: VirtualRow & { type: 'gap' } }> = React.memo(({ row }) => (
    <tr style={{ height: `${ROW_HEIGHT_PX}px` }}>
        <td colSpan={3} className="text-center py-1">
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

const DiffNavigator: React.FC<{ onPrev: () => void; onNext: () => void; isPrevDisabled: boolean; isNextDisabled: boolean; }> = ({ onPrev, onNext, isPrevDisabled, isNextDisabled }) => (
    <div className="flex items-center justify-center bg-gray-800 ml-1 p-1">
        <div className="flex flex-col items-center justify-center space-y-2">
            <button
                onClick={onPrev}
                disabled={isPrevDisabled}
                className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                aria-label="Go to previous difference"
                title="Go to previous difference"
            >
                <GoToNextIcon className="w-6 h-6 transform -rotate-90" />
            </button>
            <button
                onClick={onNext}
                disabled={isNextDisabled}
                className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                aria-label="Go to next difference"
                title="Go to next difference"
            >
                <GoToPreviousIcon className="w-6 h-6 transform -rotate-90" />
            </button>
        </div>
        <div 
            className="text-xs font-bold text-gray-500 tracking-widest uppercase"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
            Diffs
        </div>
    </div>
);

export interface ComparisonMapActions {
    goToAddress: (address: number) => void;
}

interface ComparisonMapProps {
    comparison: ComparisonMemory;
    onScrollUpdate: (activeSegmentIndex: number) => void;
}

export const ComparisonMap = forwardRef<ComparisonMapActions, ComparisonMapProps>(({ comparison, onScrollUpdate }, ref) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [highlightedRowStart, setHighlightedRowStart] = useState<number | null>(null);
  const [highlightedDiffAddress, setHighlightedDiffAddress] = useState<number | null>(null);
  const lastReportedSegmentIndex = useRef<number | null>(null);

  const memoizedData = useMemo(() => {
    const virtualRows = comparison.getVirtualRows();
    if (virtualRows.length === 0) return null;
    
    const totalRowCount = virtualRows.length;
    const height = totalRowCount * ROW_HEIGHT_PX;
    return { virtualRows, totalRowCount, totalHeight: height, diffAddresses: comparison.getDiffAddresses() };
  }, [comparison]);

  useEffect(() => {
      if (!memoizedData || !scrollContainerRef.current) return;
      const { virtualRows, totalRowCount } = memoizedData;
      if (totalRowCount === 0) return;

      const currentVirtualRowIndex = Math.min(totalRowCount - 1, Math.floor(scrollTop / ROW_HEIGHT_PX));
      const currentRow = virtualRows[currentVirtualRowIndex];
      
      if (currentRow && currentRow.segmentIndex !== lastReportedSegmentIndex.current) {
          onScrollUpdate(currentRow.segmentIndex);
          lastReportedSegmentIndex.current = currentRow.segmentIndex;
      }
  }, [scrollTop, memoizedData, onScrollUpdate]);

  useEffect(() => { lastReportedSegmentIndex.current = null; }, [memoizedData]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    const resizeObserver = new ResizeObserver(() => setViewportHeight(scrollContainer.clientHeight));
    resizeObserver.observe(scrollContainer);
    setViewportHeight(scrollContainer.clientHeight);
    return () => resizeObserver.disconnect();
  }, [memoizedData]);

  useEffect(() => {
    setScrollTop(0);
    if(scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [memoizedData]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => { setScrollTop(e.currentTarget.scrollTop); };
  const handleNavigate = useCallback((newScrollTop: number) => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = newScrollTop;
  }, []);

  const scrollToAddress = useCallback((address: number) => {
    if (!memoizedData) return -1;
    const { virtualRows } = memoizedData;

    let finalIndex = virtualRows.findIndex(row => 
        (row.type === 'data' && address >= row.address && address < row.address + BYTES_PER_ROW) ||
        (row.type === 'gap' && address >= row.startAddress && address <= row.endAddress)
    );
    if (finalIndex === -1) {
        const targetRowAddress = Math.floor(address / BYTES_PER_ROW) * BYTES_PER_ROW;
        finalIndex = virtualRows.findIndex(row => row.type === 'data' && row.address === targetRowAddress);
    }
    if (finalIndex !== -1) {
        handleNavigate(finalIndex * ROW_HEIGHT_PX);
        return virtualRows[finalIndex].type === 'data' ? (virtualRows[finalIndex] as any).address : -1;
    }
    return -1;
  }, [memoizedData, handleNavigate]);

  useImperativeHandle(ref, () => ({
    goToAddress: (address: number) => {
        setHighlightedDiffAddress(null); // External navigation clears diff highlight
        const rowAddress = scrollToAddress(address);
        if (rowAddress !== -1) {
            setHighlightedRowStart(rowAddress);
            setTimeout(() => setHighlightedRowStart(null), 2000);
        }
    },
  }));

  const handleNextDiff = useCallback(() => {
    if (!memoizedData || memoizedData.diffAddresses.length === 0) return;
    const { diffAddresses } = memoizedData;
    const currentIndex = diffAddresses.indexOf(highlightedDiffAddress);
    const nextIndex = (currentIndex === -1) ? 0 : currentIndex + 1;
    if (nextIndex < diffAddresses.length) {
        const nextAddress = diffAddresses[nextIndex];
        scrollToAddress(nextAddress);
        setHighlightedDiffAddress(nextAddress);
    }
  }, [highlightedDiffAddress, memoizedData, scrollToAddress]);

  const handlePreviousDiff = useCallback(() => {
    if (!memoizedData || memoizedData.diffAddresses.length === 0) return;
    const { diffAddresses } = memoizedData;
    const currentIndex = diffAddresses.indexOf(highlightedDiffAddress);
    const prevIndex = (currentIndex === -1) ? diffAddresses.length - 1 : currentIndex - 1;
    if (prevIndex >= 0) {
        const prevAddress = diffAddresses[prevIndex];
        scrollToAddress(prevAddress);
        setHighlightedDiffAddress(prevAddress);
    }
  }, [highlightedDiffAddress, memoizedData, scrollToAddress]);

  if (!memoizedData) return <p className="text-center text-gray-400">No differences to display.</p>;
  
  const { virtualRows, totalRowCount, totalHeight, diffAddresses } = memoizedData;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - BUFFER_ROWS);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + 2 * BUFFER_ROWS;
  const endIndex = Math.min(totalRowCount, startIndex + visibleRowCount);
  const paddingTop = startIndex * ROW_HEIGHT_PX;

  const renderedRows = [];
  for (let i = startIndex; i < endIndex; i++) {
    const row = virtualRows[i];
    if (row.type === 'gap') {
        renderedRows.push(<GapRow key={`gap-${i}`} row={row} />);
    } else {
        const rowAddress = row.address;
        const rowDiffs = Array.from({ length: BYTES_PER_ROW }, (_, j) => comparison.getDiffEntry(rowAddress + j));
        const isRowHighlighted = highlightedRowStart === rowAddress;
        renderedRows.push(
            <tr key={rowAddress} className={`hover:bg-gray-700/50 ${isRowHighlighted ? 'row-highlight' : ''}`} style={{ height: `${ROW_HEIGHT_PX}px` }}>
                <td className="p-2 w-36 text-cyan-400 font-mono">{formatHex(rowAddress)}</td>
                <td className="p-2 font-mono tracking-wider space-x-1">
                    {rowDiffs.map((diff, idx) => {
                        const isHighlighted = highlightedDiffAddress === (rowAddress + idx);
                        return <HexByte key={idx} diff={diff} isHighlighted={isHighlighted} />;
                    })}
                </td>
                <td className="p-2 w-44 font-mono">
                    {rowDiffs.map((diff, idx) => {
                        const isHighlighted = highlightedDiffAddress === (rowAddress + idx);
                        return <AsciiChar key={idx} diff={diff} isHighlighted={isHighlighted} />;
                    })}
                </td>
            </tr>
        );
    }
  }

  const currentIndex = diffAddresses.indexOf(highlightedDiffAddress);
  const isPrevDisabled = currentIndex === 0;
  const isNextDisabled = highlightedDiffAddress !== null && currentIndex === diffAddresses.length - 1;

  return (
    <div className="bg-gray-800/50 rounded-lg shadow-xl backdrop-blur-sm border border-gray-700 flex flex-col overflow-hidden flex-grow">
        <div className="text-gray-400 bg-gray-800/80 backdrop-blur-sm z-10 flex-shrink-0 border-b border-gray-700">
            <table className="w-full text-sm text-left table-fixed">
            <thead>
                <tr>
                <th className="p-2 w-36 font-semibold">Address</th>
                <th className="p-2 font-semibold">Data (Hex) - File B</th>
                <th className="p-2 w-44 font-semibold">ASCII - File B</th>
                </tr>
            </thead>
            </table>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
            <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="overflow-auto relative flex-1 no-scrollbar"
            aria-label="Memory Comparison Map"
            >
                <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                    <table className="w-full text-sm text-left table-fixed" style={{ transform: `translateY(${paddingTop}px)`, position: 'absolute', top: 0, left: 0, width: '100%' }}>
                        <tbody className="text-gray-200 divide-y divide-gray-700/50">
                            {renderedRows}
                        </tbody>
                    </table>
                </div>
            </div>
            <ComparisonMinimap
                comparison={comparison}
                scrollTop={scrollTop}
                totalHeight={totalHeight}
                viewportHeight={viewportHeight}
                onNavigate={handleNavigate}
            />
            {diffAddresses.length > 0 && (
                <DiffNavigator onPrev={handlePreviousDiff} onNext={handleNextDiff} isPrevDisabled={isPrevDisabled} isNextDisabled={isNextDisabled} />
            )}
        </div>
    </div>
  );
});