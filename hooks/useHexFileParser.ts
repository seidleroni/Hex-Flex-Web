import { useState, useCallback } from 'react';
import { parseHexFile } from '../services/hexParser';
import { SparseMemory } from '../services/sparseMemory';
import { FileState } from '../types';

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

    if (!file.name.toLowerCase().endsWith('.hex')) {
      setError("Invalid file type. Please upload a '.hex' file.");
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
