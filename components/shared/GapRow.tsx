import React from 'react';
import type { VirtualRow } from '../../types';
import { ROW_HEIGHT_PX } from '../../constants';
import { formatHex, formatBytes } from '../../utils';

export const GapRow: React.FC<{ row: VirtualRow & { type: 'gap' }; showAscii: boolean }> = React.memo(({ row, showAscii }) => (
    <tr style={{ height: `${ROW_HEIGHT_PX}px` }}>
        <td colSpan={showAscii ? 3 : 2} className="text-center py-1">
            <div 
              className="inline-block w-full" 
              title={`Skipped addresses from ${formatHex(row.startAddress)} to ${formatHex(row.endAddress)}`}
            >
                <span className="font-mono text-xs text-gray-500 tracking-wider bg-gray-900/50 px-4 py-1.5 rounded-full border border-dashed border-gray-700">
                    ... GAP: {formatBytes(row.skippedBytes)} SKIPPED ...
                </span>
            </div>
        </td>
    </tr>
));
