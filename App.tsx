import React, { useState } from 'react';
import Header from './components/Header';
import SingleFileView from './views/SingleFileView';
import ComparisonView from './views/ComparisonView';
import { ViewMode } from './types';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('view');

  return (
    <div className="h-full bg-gray-900 text-gray-200 font-sans flex flex-col">
      <Header viewMode={viewMode} setViewMode={setViewMode} />
      <main className="flex-grow container mx-auto p-4 md:p-6 lg:p-8 flex flex-col min-h-0 items-center justify-center">
        {viewMode === 'view' ? <SingleFileView /> : <ComparisonView />}
      </main>
    </div>
  );
};

export default App;