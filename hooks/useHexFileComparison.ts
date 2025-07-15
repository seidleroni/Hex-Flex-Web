import { useState, useCallback, useReducer } from 'react';
import { parseHexFile } from '../services/hexParser';
import { FileState, ComparisonState } from '../types';

type Action =
  | { type: 'PARSE_START'; fileKey: 'fileA' | 'fileB'; fileName: string }
  | { type: 'PARSE_SUCCESS'; fileKey: 'fileA' | 'fileB'; memory: NonNullable<FileState['memory']> }
  | { type: 'PARSE_ERROR'; fileKey: 'fileA' | 'fileB'; error: string }
  | { type: 'RESET_FILE'; fileKey: 'fileA' | 'fileB' };

const initialFileState: FileState = {
  memory: null,
  fileName: '',
  error: null,
  isLoading: false,
};

const initialState: ComparisonState = {
  fileA: initialFileState,
  fileB: initialFileState,
};

const reducer = (state: ComparisonState, action: Action): ComparisonState => {
  switch (action.type) {
    case 'PARSE_START':
      return {
        ...state,
        [action.fileKey]: {
          ...initialFileState,
          isLoading: true,
          fileName: action.fileName,
        },
      };
    case 'PARSE_SUCCESS':
      return {
        ...state,
        [action.fileKey]: {
          ...state[action.fileKey],
          isLoading: false,
          memory: action.memory,
          error: null,
        },
      };
    case 'PARSE_ERROR':
      return {
        ...state,
        [action.fileKey]: {
          ...state[action.fileKey],
          isLoading: false,
          memory: null,
          error: action.error,
        },
      };
    case 'RESET_FILE':
        return {
            ...state,
            [action.fileKey]: initialFileState
        }
    default:
      return state;
  }
};

const useHexFileComparison = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const parseFile = useCallback(async (file: File, fileKey: 'fileA' | 'fileB') => {
    if (!file.name.toLowerCase().endsWith('.hex')) {
      dispatch({ type: 'PARSE_ERROR', fileKey, error: "Invalid file type. Please upload a '.hex' file." });
      return;
    }
    
    dispatch({ type: 'PARSE_START', fileKey, fileName: file.name });

    try {
      const content = await file.text();
      const parsedMemory = parseHexFile(content);

      if (parsedMemory.isEmpty()) {
        dispatch({ type: 'PARSE_ERROR', fileKey, error: 'The HEX file is empty or has no data records.' });
      } else {
        dispatch({ type: 'PARSE_SUCCESS', fileKey, memory: parsedMemory });
      }
    } catch (err) {
      const message = err instanceof Error ? `Error parsing file: ${err.message}` : 'An unknown parsing error occurred.';
      dispatch({ type: 'PARSE_ERROR', fileKey, error: message });
    }
  }, []);

  const resetFile = useCallback((fileKey: 'fileA' | 'fileB') => {
    dispatch({ type: 'RESET_FILE', fileKey });
  }, []);

  const parseFileA = useCallback((file: File) => parseFile(file, 'fileA'), [parseFile]);
  const parseFileB = useCallback((file: File) => parseFile(file, 'fileB'), [parseFile]);
  const resetFileA = useCallback(() => resetFile('fileA'), [resetFile]);
  const resetFileB = useCallback(() => resetFile('fileB'), [resetFile]);

  return { ...state, parseFileA, parseFileB, resetFileA, resetFileB };
};

export default useHexFileComparison;
