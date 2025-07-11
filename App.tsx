
import React, { useState, useCallback, useMemo } from 'react';
import { parseHexFile } from './services/hexParser';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import { MemoryMap } from './components/MemoryMap';
import { ResetIcon } from './components/Icons';
import { SparseMemory } from './services/sparseMemory';

const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatHex = (n: number, padding: number = 8) => `0x${n.toString(16).toUpperCase().padStart(padding, '0')}`;

const App: React.FC = () => {
  const [memory, setMemory] = useState<SparseMemory | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!memory || memory.isEmpty()) {
      return null;
    }
    return {
      startAddress: memory.getStartAddress(),
      endAddress: memory.getEndAddress(),
      dataSize: memory.getDataSize(),
    };
  }, [memory]);

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setMemory(null);
    setFileName('');

    if (!file.name.toLowerCase().endsWith('.hex')) {
      setError("Invalid file type. Please upload a '.hex' file.");
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const parsedMemory = parseHexFile(content);
        if (parsedMemory.isEmpty()) {
          setError("The HEX file is empty or does not contain any data records.");
          return;
        }
        setMemory(parsedMemory);
      } catch (err) {
        if (err instanceof Error) {
            setError(`Error parsing HEX file: ${err.message}`);
        } else {
            setError("An unknown error occurred during parsing.");
        }
        setMemory(null);
      }
    };
    reader.onerror = () => {
      setError("Failed to read the file.");
    };
    reader.readAsText(file);
  }, []);
  
  const handleReset = () => {
    setMemory(null);
    setFileName('');
    setError(null);
  };


  return (
    <div className="h-full bg-gray-900 text-gray-200 font-sans flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto p-4 md:p-6 lg:p-8 flex flex-col min-h-0">
        {!memory ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="w-full max-w-2xl text-center">
              <FileUpload onFileSelect={handleFileSelect} />
              {error && (
                <div className="mt-4 bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative" role="alert">
                  <strong className="font-bold">Error: </strong>
                  <span className="block sm:inline">{error}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-7xl flex flex-col flex-grow min-h-0">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4 flex-shrink-0">
               <div className="text-center md:text-left">
                  <h2 className="text-2xl font-bold text-cyan-400">Memory Map</h2>
                  <p className="text-gray-400">File: {fileName}</p>
              </div>
              <div className="flex items-center gap-4">
                 <button
                  onClick={handleReset}
                  className="inline-flex items-center px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-300"
                >
                  <ResetIcon className="w-5 h-5 mr-2" />
                  Load New File
                </button>
              </div>
            </div>
            
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 flex-shrink-0">
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 text-center">
                        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Start Address</p>
                        <p className="text-2xl font-mono text-cyan-400 mt-1">{formatHex(stats.startAddress)}</p>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 text-center">
                        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">End Address</p>
                        <p className="text-2xl font-mono text-cyan-400 mt-1">{formatHex(stats.endAddress)}</p>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 text-center">
                        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Data Size</p>
                        <p className="text-2xl font-mono text-cyan-400 mt-1">{formatBytes(stats.dataSize)}</p>
                    </div>
                </div>
            )}

            <div className="mt-4 flex-grow flex flex-col min-h-0">
                <MemoryMap memory={memory} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;