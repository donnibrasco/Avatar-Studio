/** Read PCM/float WAV duration without modifying the audio or adding processing delay. */
export function wavDuration(buffer: Buffer): number | undefined {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WAVE') return;
  let byteRate = 0, dataSize = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunk = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) return;
    if (chunk === 'fmt ' && size >= 16) byteRate = buffer.readUInt32LE(offset + 16);
    if (chunk === 'data') dataSize += size;
    offset += 8 + size + (size % 2);
  }
  if (byteRate > 0 && dataSize > 0) return dataSize / byteRate;
}
