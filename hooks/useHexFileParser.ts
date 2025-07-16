
import { useState, useCallback } from 'react';
import { parseHexFile } from '../services/hexParser';
import { SparseMemory } from '../services/sparseMemory';
import { FileState } from '../types';
import { isIntelHexFile } from '../services/fileValidator';

export const useHexFileParser = (): [FileState, (file: File) => Promise<void>, () => void] => {
  const [memory, setMemory] = useState<SparseMemory | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const parseFile = useCallback(async (file: File) => {
    setError(null);
    setMemory(null);
    setFileName('');
    setIsLoading(true);

    const isValidHex = await isIntelHexFile(file);
    if (!isValidHex) {
      setError("Invalid file format. The file does not appear to be a valid Intel HEX file.");
      setIsLoading(false);
      return;
    }

    setFileName(file.name);

    try {
      const content = await file.text();
      const parsedMemory = parseHexFile(content);
      if (parsedMemory.isEmpty()) {
        setError("The HEX file is empty or does not contain any data records.");
        setMemory(null);
      } else {
        setMemory(parsedMemory);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(`Error parsing HEX file: ${err.message}`);
      } else {
        setError("An unknown error occurred during parsing.");
      }
      setMemory(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setMemory(null);
    setFileName('');
    setError(null);
    setIsLoading(false);
  }, []);

  return [{ memory, fileName, error, isLoading }, parseFile, reset];
};