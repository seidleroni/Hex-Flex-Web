import React, { useMemo, useRef } from 'react';
import useHexFileComparison from '../hooks/useHexFileComparison';
import { ComparisonMap, type ComparisonMapActions } from '../components/ComparisonMap';
import SegmentPanel from '../components/SegmentPanel';
import { compareMemory } from '../services/memoryComparer';
import DiffStatistics from '../components/DiffStatistics';
import FileSlot from '../components/comparison/FileSlot';
import DiffLegend from '../components/comparison/DiffLegend';
import { useSegmentManager } from '../hooks/useSegmentManager';

const ComparisonView: React.FC = () => {
  const { fileA, fileB, parseFileA, parseFileB, resetFileA, resetFileB } = useHexFileComparison();
  const comparisonMapRef = useRef<ComparisonMapActions>(null);
  
  const comparisonResult = useMemo(() => {
    if (fileA.memory && fileB.memory) {
      return compareMemory(fileA.memory, fileB.memory);
    }
    return null;
  }, [fileA.memory, fileB.memory]);

  const { segments, activeSegmentIndex, handleSegmentClick, handleScrollUpdate } = useSegmentManager(comparisonResult, comparisonMapRef);

  return (
    <div className="w-full max-w-screen-2xl mx-auto text-center flex-grow flex flex-col min-h-0">
      {!comparisonResult && (
        <div className="flex-shrink-0">
            <h2 className="text-3xl font-bold text-white mb-2">Compare HEX Files</h2>
            <p className="text-gray-400 mb-8">Upload two Intel HEX files to compare their memory content.</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-shrink-0">
        <FileSlot
          label="File A (Original)"
          fileState={fileA}
          onFileSelect={parseFileA}
          onReset={resetFileA}
        />
        <FileSlot
          label="File B (Modified)"
          fileState={fileB}
          onFileSelect={parseFileB}
          onReset={resetFileB}
        />
      </div>

      {comparisonResult && (
        <div className="mt-8 flex-grow flex flex-col min-h-0">
            <DiffStatistics stats={comparisonResult.getStats()} />
            <DiffLegend />
            <div className="mt-4 flex-grow flex flex-row min-h-0 gap-4">
              {segments.length > 1 && (
                <SegmentPanel
                  segments={segments}
                  activeSegmentIndex={activeSegmentIndex}
                  onSegmentClick={handleSegmentClick}
                />
              )}
              <ComparisonMap ref={comparisonMapRef} comparison={comparisonResult} onScrollUpdate={handleScrollUpdate} />
            </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonView;