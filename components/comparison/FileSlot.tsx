import React from 'react';
import type { FileState } from '../../types';
import FileUpload from '../FileUpload';
import { LoadingSpinner } from '../Icons';
import FileSummaryCard from '../FileSummaryCard';

interface FileSlotProps {
  label: string;
  fileState: FileState;
  onFileSelect: (file: File) => void;
  onReset: () => void;
  className?: string;
}

const FileSlot: React.FC<FileSlotProps> = ({ label, fileState, onFileSelect, onReset, className }) => {
  return (
    <div className={`flex flex-col ${className || ''}`}>
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

export default FileSlot;
