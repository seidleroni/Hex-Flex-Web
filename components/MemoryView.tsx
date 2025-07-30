import React, { useMemo, useState, useRef } from 'react';
import type { SparseMemory } from '../services/sparseMemory';
import { MemoryStats } from '../types';
import Statistics from './Statistics';
import { MemoryMap, MemoryMapActions } from './MemoryMap';
import { ResetIcon, SearchIcon } from './Icons';
import SegmentPanel from './SegmentPanel';
import MinimapLegend from './MinimapLegend';
import { useSegmentManager } from '../hooks/useSegmentManager';

interface MemoryViewProps {
    memory: SparseMemory;
    fileName: string;
    onLoadNewFile: () => void;
}

const MemoryView: React.FC<MemoryViewProps> = ({ memory, fileName, onLoadNewFile }) => {
    const memoryMapRef = useRef<MemoryMapActions>(null);
    const [addressInput, setAddressInput] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);
    
    const { segments, activeSegmentIndex, handleSegmentClick, handleScrollUpdate } = useSegmentManager(memory, memoryMapRef);

    const stats: MemoryStats | null = useMemo(() => {
        if (memory.isEmpty()) {
            return null;
        }
        return {
            startAddress: memory.getStartAddress(),
            endAddress: memory.getEndAddress(),
            dataSize: memory.getDataSize(),
        };
    }, [memory]);

    const handleGoToAddress = () => {
        if (!stats) return;

        let processedInput = addressInput.trim().toLowerCase();
        if (processedInput.startsWith('0x')) {
            processedInput = processedInput.substring(2);
        }

        if (!/^[0-9a-f]+$/.test(processedInput) || processedInput === '') {
            setInputError('Invalid hex format');
            return;
        }

        const targetAddress = parseInt(processedInput, 16);

        if (targetAddress < stats.startAddress || targetAddress > stats.endAddress) {
            setInputError('Address out of range');
            return;
        }

        setInputError(null);
        memoryMapRef.current?.goToAddress(targetAddress);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAddressInput(e.target.value);
        if (inputError) {
            setInputError(null);
        }
    }

    return (
        <div className="w-full max-w-screen-2xl mx-auto flex flex-col flex-grow min-h-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 flex-shrink-0">
                <div className="text-center md:text-left">
                    <h2 className="text-2xl font-bold text-cyan-400">Memory Map</h2>
                    <p className="text-gray-400">File: {fileName}</p>
                </div>
                
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleGoToAddress(); }}
                    className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                >
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            value={addressInput}
                            onChange={handleInputChange}
                            placeholder="Go to address (hex)"
                            aria-label="Go to address"
                            className={`bg-gray-700/50 border ${inputError ? 'border-red-500' : 'border-gray-600'} text-white placeholder-gray-400 text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full pl-4 p-2.5 transition-colors`}
                        />
                        {inputError && <p className="absolute text-xs text-red-400 -bottom-5 left-0">{inputError}</p>}
                    </div>
                    <button
                        type="submit"
                        className="p-2.5 text-sm font-medium text-white bg-cyan-600 rounded-lg border border-cyan-600 hover:bg-cyan-700 focus:ring-4 focus:outline-none focus:ring-cyan-500/50 transition-colors"
                        aria-label="Go to specified address"
                    >
                       <SearchIcon className="w-5 h-5" />
                    </button>
                    
                    <button
                        type="button"
                        onClick={onLoadNewFile}
                        className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-300"
                        aria-label="Load a new HEX file"
                    >
                        <ResetIcon className="w-5 h-5 mr-2" />
                        Load New
                    </button>
                </form>
            </div>

            {stats && <Statistics stats={stats} className="mb-4" />}
            
            {stats && <MinimapLegend />}

            <div className="flex-grow flex flex-row min-h-0 gap-4">
                {segments.length > 1 && (
                     <SegmentPanel
                        segments={segments}
                        activeSegmentIndex={activeSegmentIndex}
                        onSegmentClick={handleSegmentClick}
                    />
                )}
                <MemoryMap ref={memoryMapRef} memory={memory} onScrollUpdate={handleScrollUpdate} />
            </div>
        </div>
    );
};

export default MemoryView;