import React from 'react';
import { DiffType, type DiffEntry } from '../../types';
import { getDiffStyle } from './DiffHexByte';

const toAscii = (n: number | null) => (n !== null && n >= 32 && n <= 126) ? String.fromCharCode(n) : '.';

export const DiffAsciiChar: React.FC<{ diff: DiffEntry; isHighlighted: boolean; }> = React.memo(({ diff, isHighlighted }) => {
  const style = getDiffStyle(diff.type);
  const highlightClass = isHighlighted ? 'cell-highlight' : '';

  if (diff.type === DiffType.Modified) {
    return (
        <span style={style} className={`px-0.5 rounded text-yellow-300 font-bold ${highlightClass}`}>
            {toAscii(diff.byteB)}
        </span>
    );
  }
  
  const byteToShow = diff.byteB ?? diff.byteA;
  const isPrintable = byteToShow !== null && byteToShow >= 32 && byteToShow <= 126;
  let colorClass: string;

  switch (diff.type) {
    case DiffType.Added:
      colorClass = isPrintable ? 'text-green-300 font-bold' : 'text-gray-600';
      break;
    case DiffType.Removed:
      colorClass = 'text-gray-600 line-through';
      break;
    case DiffType.Unchanged:
    default:
      colorClass = isPrintable ? 'text-yellow-300' : 'text-gray-600';
      break;
  }

  return (
    <span style={style} className={`px-0.5 rounded ${colorClass} ${highlightClass}`}>
      {toAscii(byteToShow)}
    </span>
  );
});
