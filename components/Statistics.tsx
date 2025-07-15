import React from 'react';
import { MemoryStats } from '../types';
import { formatBytes, formatHex } from '../utils';

interface StatisticsProps {
    stats: MemoryStats;
    className?: string;
}

const StatCard: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <div className="bg-gray-800 p-2 rounded-lg border border-gray-700 text-center">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-mono text-cyan-400 mt-1">{value}</p>
    </div>
);

const Statistics: React.FC<StatisticsProps> = ({ stats, className }) => {
    return (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-2 flex-shrink-0 ${className || ''}`}>
            <StatCard label="Start Address" value={formatHex(stats.startAddress)} />
            <StatCard label="End Address" value={formatHex(stats.endAddress)} />
            <StatCard label="Data Size" value={formatBytes(stats.dataSize)} />
        </div>
    );
};

export default Statistics;