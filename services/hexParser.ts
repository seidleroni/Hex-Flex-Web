import { SparseMemory } from './sparseMemory';

/**
 * Parses the content of an Intel HEX file into a SparseMemory object.
 * @param hexContent The string content of the .hex file.
 * @returns A SparseMemory object populated with the file's data.
 * @throws An error if the file format is invalid.
 */
export const parseHexFile = (hexContent: string): SparseMemory => {
  const lines = hexContent.split(/\r?\n/).filter(line => line.startsWith(':'));
  const memory = new SparseMemory();
  let extendedLinearAddress = 0;

  for (const line of lines) {
    if (line.length < 11) { // Minimum length for a valid record
      throw new Error(`Invalid record length in line: ${line}`);
    }

    const byteCount = parseInt(line.substring(1, 3), 16);
    const address = parseInt(line.substring(3, 7), 16);
    const recordType = parseInt(line.substring(7, 9), 16);
    const dataString = line.substring(9, 9 + byteCount * 2);
    const checksum = parseInt(line.substring(9 + byteCount * 2), 16);

    // Validate checksum
    let calculatedChecksum = (byteCount + (address >> 8) + (address & 0xFF) + recordType) & 0xFF;
    const dataBytes: number[] = [];
    for (let i = 0; i < byteCount; i++) {
      const byte = parseInt(dataString.substring(i * 2, i * 2 + 2), 16);
      dataBytes.push(byte);
      calculatedChecksum = (calculatedChecksum + byte) & 0xFF;
    }
    calculatedChecksum = (256 - calculatedChecksum) & 0xFF;

    if (calculatedChecksum !== checksum) {
      throw new Error(`Checksum mismatch in line: ${line}`);
    }

    switch (recordType) {
      case 0x00: // Data Record
        const fullAddress = extendedLinearAddress + address;
        for (let i = 0; i < dataBytes.length; i++) {
          memory.setByte(fullAddress + i, dataBytes[i]);
        }
        break;
      case 0x01: // End of File Record
        return memory;
      case 0x02: // Extended Segment Address Record (ignored, favor ELA)
        break;
      case 0x04: // Extended Linear Address Record
        if (byteCount !== 2) throw new Error("Invalid ELA record");
        extendedLinearAddress = (dataBytes[0] << 24) | (dataBytes[1] << 16);
        break;
      case 0x05: // Start Linear Address Record (ignored)
        break;
      default: // Unsupported record type
        break;
    }
  }

  // If EOF record was missing, process what we have
  return memory;
};
