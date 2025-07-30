import React from 'react';
import { DiffType, type DiffEntry } from '../../types';
import { 
    EMPTY_BYTE_HEX_PLACEHOLDER,
    DIFF_MODIFIED_BG,
    DIFF_ADDED_BG,
    DIFF_REMOVED_BG
} from '../../constants';

const formatByte = (n: number | null) => n === null ? EMPTY_BYTE_HEX_PLACEHOLDER : n.toString(16).toUpperCase().padStart(2, '0');

export const getDiffStyle = (type: DiffType): React.CSSProperties => {
  switch (type) {
    case DiffType.Modified: return { backgroundColor: DIFF_MODIFIED_BG };
    case DiffType.Added:    return { backgroundColor: DIFF_ADDED_BG };
    case DiffType.Removed:  return { backgroundColor: DIFF_REMOVED_BG };
    default: return {};
  }
};

export const DiffHexByte: React.FC<{ diff: DiffEntry; isHighlighted: boolean; }> = React.memo(({ diff, isHighlighted }) => {
  const byteToShow = diff.byteB ?? diff.byteA;
  const highlightClass = isHighlighted ? 'cell-highlight' : '';

  let textClass: string;
  switch (diff.type) {
    case DiffType.Modified:
      textClass = 'text-yellow-300 font-bold';
      break;
    case DiffType.Added:
      textClass = 'text-green-300 font-bold';
      break;
    case DiffType.Removed:
      textClass = 'text-gray-600 line-through';
      break;
    default:
      textClass = 'text-gray-300';
  }

  return (
    <span style={getDiffStyle(diff.type)} className={`px-0.5 rounded ${textClass} ${highlightClass}`}>
      {formatByte(byteToShow)}
    </span>
  );
});
