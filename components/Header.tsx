
import React from 'react';
import { HexFlexIcon } from './Icons';

const Header: React.FC = () => {
  return (
    <header className="bg-gray-800/50 backdrop-blur-sm w-full shadow-lg border-b border-cyan-400/20 sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-center">
        <HexFlexIcon className="w-8 h-8 md:w-10 md:h-10 text-cyan-400 mr-4"/>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Hex Flex
          </h1>
          <p className="text-sm text-gray-400 hidden md:block">The simple web tool for viewing Intel HEX data.</p>
        </div>
      </div>
    </header>
  );
};

export default Header;