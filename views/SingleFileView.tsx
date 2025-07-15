import React from 'react';
import FileUpload from '../components/FileUpload';
import MemoryView from '../components/MemoryView';
import { LoadingSpinner } from '../components/Icons';
import { useHexFileParser } from '../hooks/useHexFileParser';

const SingleFileView: React.FC = () => {
  const [fileState, parseFile, reset] = useHexFileParser();
  const { memory, fileName, error, isLoading } = fileState;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <LoadingSpinner className="w-12 h-12 text-cyan-400" />
        <p className="text-lg text-gray-400">Parsing HEX file...</p>
      </div>
    );
  }

  if (memory) {
    return <MemoryView memory={memory} fileName={fileName} onLoadNewFile={reset} />;
  }

  return (
    <div className="w-full max-w-2xl text-center">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Intel HEX File Viewer</h2>
        <p className="text-gray-400">
          Upload an Intel HEX file to view its memory content.
        </p>
      </div>
      <FileUpload onFileSelect={parseFile} />
      {error && (
        <div className="mt-4 bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
    </div>
  );
};

export default SingleFileView;
