
import React from 'react';
import { HexFlexIcon } from './Icons';
import { ViewMode } from '../types';

interface HeaderProps {
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
}

const ViewSwitcher: React.FC<HeaderProps> = ({ viewMode, setViewMode }) => {
    // Base classes include a focus ring for accessibility on any button that is tabbed to.
    const baseClasses = "px-4 py-1.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500";
    
    // Classes for the button when it's the selected view
    const activeClasses = "bg-cyan-500 text-white shadow-md";
    
    // Classes for the non-selected button
    const inactiveClasses = "bg-transparent text-gray-300 hover:bg-gray-700/50";
    
    // A persistent outline for the active button, matching the focus style.
    const activeOutlineClasses = "ring-2 ring-offset-2 ring-offset-gray-800 ring-cyan-500";

    return (
        <div className="flex items-center p-1 bg-gray-900/60 rounded-lg">
            <button
                onClick={() => setViewMode('view')}
                className={`${baseClasses} rounded-l-md ${viewMode === 'view' ? `${activeClasses} ${activeOutlineClasses}` : inactiveClasses}`}
                aria-pressed={viewMode === 'view'}
            >
                View
            </button>
            <button
                onClick={() => setViewMode('compare')}
                className={`${baseClasses} rounded-r-md ${viewMode === 'compare' ? `${activeClasses} ${activeOutlineClasses}` : inactiveClasses}`}
                aria-pressed={viewMode === 'compare'}
            >
                Compare
            </button>
        </div>
    );
};


const Header: React.FC<HeaderProps> = ({ viewMode, setViewMode }) => {
  return (
    <header className="bg-gray-800/50 backdrop-blur-sm w-full shadow-lg border-b border-cyan-400/20 sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center">
            <HexFlexIcon className="w-8 h-8 md:w-10 md:h-10 text-cyan-400 mr-4"/>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Hex Flex
              </h1>
              <p className="text-sm text-gray-400 hidden md:block">A web tool to view and compare Intel Hex files</p>
            </div>
        </div>
        <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
      </div>
    </header>
  );
};

export default Header;