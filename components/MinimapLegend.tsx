import React from 'react';
import { MINIMAP_DATA_COLOR, MINIMAP_EMPTY_COLOR, MINIMAP_ERASED_COLOR, MINIMAP_GAP_COLOR } from '../constants';

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <div className="flex items-center gap-2">
        <span className="w-4 h-4 rounded" style={{ backgroundColor: color }}></span> {label}
    </div>
);

const MinimapLegend: React.FC = () => (
    <div className="flex items-center justify-center gap-6 my-4 text-sm text-gray-400 flex-shrink-0" aria-label="Minimap Legend">
        <LegendItem color={MINIMAP_DATA_COLOR} label="Data" />
        <LegendItem color={MINIMAP_ERASED_COLOR} label="Erased (0xFF)" />
        <LegendItem color={MINIMAP_EMPTY_COLOR} label="Empty Space" />
        <LegendItem color={MINIMAP_GAP_COLOR} label="Large Gap" />
    </div>
);

export default MinimapLegend;