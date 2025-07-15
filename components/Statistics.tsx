import React from 'react';
import { MemoryStats } from '../types';
import { formatBytes, formatHex } from '../utils';

interface StatisticsProps {
    stats: MemoryStats;
}

const StatCard: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 text-center">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-mono text-cyan-400 mt-1">{value}</p>
    </div>
);

const Statistics: React.FC<StatisticsProps> = ({ stats }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 flex-shrink-0">
            <StatCard label="Start Address" value={formatHex(stats.startAddress)} />
            <StatCard label="End Address" value={formatHex(stats.endAddress)} />
            <StatCard label="Data Size" value={formatBytes(stats.dataSize)} />
        </div>
    );
};

export default Statistics;
