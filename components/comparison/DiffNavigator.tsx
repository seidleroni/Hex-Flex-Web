import React from 'react';
import { GoToNextIcon, GoToPreviousIcon } from '../Icons';

export const DiffNavigator: React.FC<{ onPrev: () => void; onNext: () => void; isPrevDisabled: boolean; isNextDisabled: boolean; }> = ({ onPrev, onNext, isPrevDisabled, isNextDisabled }) => (
    <div className="flex-shrink-0 flex items-center justify-center bg-gray-800 ml-1 p-1">
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
