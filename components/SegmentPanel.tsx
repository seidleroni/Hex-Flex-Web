import React from 'react';
import { formatHex, formatBytes } from '../utils';

interface Segment {
    start: number;
    end: number;
    size: number;
}

interface SegmentPanelProps {
    segments: Segment[];
    activeSegmentIndex: number;
    onSegmentClick: (address: number) => void;
}

const SegmentPanel: React.FC<SegmentPanelProps> = ({ segments, activeSegmentIndex, onSegmentClick }) => {
    return (
        <div className="flex-shrink-0 w-80 bg-gray-800/50 rounded-lg shadow-xl backdrop-blur-sm border border-gray-700 flex flex-col overflow-hidden">
            <h3 className="text-lg font-semibold text-white p-4 border-b border-gray-700 flex-shrink-0">Data Segments</h3>
            <div className="overflow-y-auto flex-grow">
                <ul className="divide-y divide-gray-700/50">
                    {segments.map((segment, index) => {
                        const isActive = index === activeSegmentIndex;
                        return (
                            <li key={segment.start}>
                                <button
                                    onClick={() => onSegmentClick(segment.start)}
                                    className={`w-full text-left p-4 transition-colors duration-150 ${
                                        isActive
                                            ? 'bg-cyan-900/50'
                                            : 'hover:bg-gray-700/50'
                                    }`}
                                    aria-current={isActive ? 'true' : 'false'}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`font-bold ${isActive ? 'text-cyan-300' : 'text-white'}`}>Segment {index + 1}</span>
                                        <span className={`text-sm px-2 py-0.5 rounded-full ${isActive ? 'bg-cyan-400 text-gray-900 font-semibold' : 'bg-gray-600 text-gray-300'}`}>{formatBytes(segment.size)}</span>
                                    </div>
                                    <div className={`font-mono text-xs ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                                        {formatHex(segment.start)} &rarr; {formatHex(segment.end)}
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export default SegmentPanel;
