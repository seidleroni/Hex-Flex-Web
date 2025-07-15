import React, { useMemo } from 'react';
import type { FileState, MemoryStats } from '../types';
import { ResetIcon } from './Icons';
import Statistics from './Statistics';

interface FileSummaryCardProps {
    label: string;
    fileState: FileState;
    onReset: () => void;
}

const FileSummaryCard: React.FC<FileSummaryCardProps> = ({ label, fileState, onReset }) => {
    const stats: MemoryStats | null = useMemo(() => {
        if (!fileState.memory || fileState.memory.isEmpty()) {
            return null;
        }
        return {
            startAddress: fileState.memory.getStartAddress(),
            endAddress: fileState.memory.getEndAddress(),
            dataSize: fileState.memory.getDataSize(),
        };
    }, [fileState.memory]);

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3 flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h3 className="text-lg font-bold text-cyan-400">{label}</h3>
                    <p className="text-sm text-gray-400 truncate" title={fileState.fileName}>
                        {fileState.fileName}
                    </p>
                </div>
                <button
                    onClick={onReset}
                    className="inline-flex items-center px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-300 flex-shrink-0"
                    aria-label={`Load a new file for ${label}`}
                >
                    <ResetIcon className="w-4 h-4 mr-2" />
                    New
                </button>
            </div>
            {stats ? (
                 <div>
                    <Statistics stats={stats} />
                </div>
            ) : (
                <div className="flex items-center justify-center py-8">
                    <p className="text-gray-500">No data to display.</p>
                </div>
            )}
        </div>
    );
};

export default FileSummaryCard;