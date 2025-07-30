import React from 'react';
import { EMPTY_BYTE_HEX_PLACEHOLDER } from '../../constants';

const formatByte = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

// A component for a single styled byte in the hex view
export const ViewHexByte: React.FC<{ byte: number | null; isHighlighted?: boolean }> = React.memo(({ byte, isHighlighted }) => {
  const baseClasses = "px-1 rounded"; // Consistent padding for all bytes to prevent layout shift

  if (isHighlighted) {
    return (
        <span className={`${baseClasses} cell-highlight bg-cyan-400 text-gray-900 font-bold`}>
            {byte === null ? EMPTY_BYTE_HEX_PLACEHOLDER : formatByte(byte)}
        </span>
    );
  }
  
  if (byte === null) {
    return <span className={`${baseClasses} text-gray-600`}>{EMPTY_BYTE_HEX_PLACEHOLDER}</span>;
  }
  return <span className={`${baseClasses} text-gray-300`}>{formatByte(byte)}</span>;
});
