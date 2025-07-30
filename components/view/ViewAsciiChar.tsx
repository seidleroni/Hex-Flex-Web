import React from 'react';

const toAscii = (n: number) => (n >= 32 && n <= 126) ? String.fromCharCode(n) : '.';

// A component for a single styled character in the ASCII view
export const ViewAsciiChar: React.FC<{ byte: number | null; isHighlighted?: boolean }> = React.memo(({ byte, isHighlighted }) => {
    const baseClasses = "px-0.5 rounded"; // Consistent padding

    if (isHighlighted) {
        return (
            <span className={`${baseClasses} cell-highlight bg-cyan-400 text-gray-900 font-bold`}>
                {toAscii(byte)}
            </span>
        );
    }
    
    if (byte === null) return <span className={baseClasses}> </span>;
      
    const isPrintable = byte >= 32 && byte <= 126;
    const colorClass = isPrintable ? 'text-yellow-300' : 'text-gray-600';

    return <span className={`${baseClasses} ${colorClass}`}>{toAscii(byte)}</span>;
});
