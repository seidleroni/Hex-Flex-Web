import React, { useMemo, useState, useRef, useCallback } from 'react';
import FileUpload from '../components/FileUpload';
import useHexFileComparison from '../hooks/useHexFileComparison';
import { LoadingSpinner } from '../components/Icons';
import FileSummaryCard from '../components/FileSummaryCard';
import DiffStatistics from '../components/DiffStatistics';
import { ComparisonMap, type ComparisonMapActions } from '../components/ComparisonMap';
import SegmentPanel from '../components/SegmentPanel';
import { compareMemory } from '../services/memoryComparer';
import type { FileState } from '../types';
import { 
    DIFF_ADDED_MARKER,
    DIFF_MODIFIED_MARKER,
    DIFF_REMOVED_MARKER,
    MINIMAP_DATA_COLOR,
    MINIMAP_ERASED_COLOR,
    MINIMAP_EMPTY_COLOR,
    MINIMAP_GAP_COLOR
} from '../constants';

interface FileSlotProps {
  label: string;
  fileState: FileState;
  onFileSelect: (file: File) => void;
  onReset: () => void;
  className?: string;
}

const FileSlot: React.FC<FileSlotProps> = ({ label, fileState, onFileSelect, onReset, className }) => {
  return (
    <div className={`flex flex-col ${className}`}>
        <h3 className="text-xl font-bold text-white mb-4">{label}</h3>
      {fileState.isLoading ? (
        <div className="flex-grow flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed rounded-xl border-gray-600 bg-gray-800 min-h-[250px]">
          <LoadingSpinner className="w-12 h-12 text-cyan-400" />
          <p className="text-lg text-gray-400">Parsing...</p>
        </div>
      ) : fileState.memory ? (
        <FileSummaryCard label={label} fileState={fileState} onReset={onReset} />
      ) : (
        <div>
          <FileUpload
            onFileSelect={onFileSelect}
            className="mt-0"
          />
          {fileState.error && (
            <div className="mt-4 bg-red-900/70 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm" role="alert">
              <strong className="font-bold">Error: </strong>
              <span>{fileState.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DiffLegend: React.FC = () => (
    <div className="flex items-center justify-center flex-wrap gap-x-6 gap-y-2 my-4 text-sm text-gray-400 flex-shrink-0">
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: DIFF_ADDED_MARKER }}></span> Added
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: DIFF_MODIFIED_MARKER }}></span> Modified
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: DIFF_REMOVED_MARKER }}></span> Removed
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_DATA_COLOR }}></span> Data
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_ERASED_COLOR }}></span> Erased (0xFF)
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_EMPTY_COLOR }}></span> Empty Space
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_GAP_COLOR }}></span> Large Gap
        </div>
    </div>
);


const ComparisonView: React.FC = () => {
  const { fileA, fileB, parseFileA, parseFileB, resetFileA, resetFileB } = useHexFileComparison();
  const comparisonMapRef = useRef<ComparisonMapActions>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

  const comparisonResult = useMemo(() => {
    if (fileA.memory && fileB.memory) {
      setActiveSegmentIndex(0);
      return compareMemory(fileA.memory, fileB.memory);
    }
    return null;
  }, [fileA.memory, fileB.memory]);

  const dataSegments = useMemo(() => {
    if (!comparisonResult) return [];
    return comparisonResult.getDataSegments();
  }, [comparisonResult]);

  const handleScrollUpdate = useCallback((index: number) => {
    setActiveSegmentIndex(index);
  }, []);

  const handleSegmentClick = useCallback((address: number) => {
    comparisonMapRef.current?.goToAddress(address);
  }, []);


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
              {dataSegments.length > 1 && (
                <SegmentPanel
                  segments={dataSegments}
                  activeSegmentIndex={activeSegmentIndex}
                  onSegmentClick={handleSegmentClick}
                />
              )}
              <div className="flex-grow flex flex-col min-h-0">
                <ComparisonMap ref={comparisonMapRef} comparison={comparisonResult} onScrollUpdate={handleScrollUpdate} />
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonView;