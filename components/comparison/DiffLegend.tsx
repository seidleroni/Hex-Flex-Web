import React from 'react';
import { 
    DIFF_ADDED_MARKER,
    DIFF_MODIFIED_MARKER,
    DIFF_REMOVED_MARKER,
    MINIMAP_DATA_COLOR,
    MINIMAP_ERASED_COLOR,
    MINIMAP_EMPTY_COLOR,
    MINIMAP_GAP_COLOR
} from '../../constants';

const DiffLegend: React.FC = () => (
    <div className="flex items-center justify-center flex-wrap gap-x-6 gap-y-2 my-4 text-sm text-gray-400 flex-shrink-0">
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: DIFF_ADDED_MARKER }}></span> Added
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: DIFF_MODIFIED_MARKER }}></span> Modified
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: DIFF_REMOVED_MARKER }}></span> Removed
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_DATA_COLOR }}></span> Data
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_ERASED_COLOR }}></span> Erased (0xFF)
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_EMPTY_COLOR }}></span> Empty Space
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: MINIMAP_GAP_COLOR }}></span> Large Gap
        </div>
    </div>
);

export default DiffLegend;
