
/**
 * Quickly checks if a file is likely an Intel HEX file by inspecting its first few lines.
 * This avoids reading the entire file into memory for an initial validation.
 * @param file The file to check.
 * @returns A promise that resolves to true if the file is likely an Intel HEX file, false otherwise.
 */
export const isIntelHexFile = async (file: File): Promise<boolean> => {
  // Read the first 4KB, which should be more than enough for a header check.
  const slice = file.slice(0, 4096);
  const text = await slice.text();
  
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  // If there are no non-empty lines, it's not a valid HEX file.
  if (lines.length === 0) {
    return false;
  }

  // Check the first few lines (up to 5) to see if they follow the HEX format.
  const linesToCheck = lines.slice(0, 5);
  
  // Every line in an Intel HEX file must start with a colon.
  return linesToCheck.every(line => line.startsWith(':'));
};
