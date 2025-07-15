import React from 'react';
import type { DiffStats } from '../types';
import { DIFF_MODIFIED_MARKER, DIFF_ADDED_MARKER, DIFF_REMOVED_MARKER } from '../constants';

interface DiffStatisticsProps {
  stats: DiffStats;
}

const DiffStatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 text-center">
    <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
    <p className="text-3xl font-mono mt-1" style={{ color: color }}>
      {value}
    </p>
  </div>
);

const DiffStatistics: React.FC<DiffStatisticsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
      <DiffStatCard label="Bytes Modified" value={stats.modified} color={DIFF_MODIFIED_MARKER} />
      <DiffStatCard label="Bytes Added" value={stats.added} color={DIFF_ADDED_MARKER} />
      <DiffStatCard label="Bytes Removed" value={stats.removed} color={DIFF_REMOVED_MARKER} />
    </div>
  );
};

export default DiffStatistics;
