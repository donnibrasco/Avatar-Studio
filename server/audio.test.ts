import test from 'node:test';
import assert from 'node:assert/strict';
import { wavDuration } from './audio';

export function makeWav(seconds: number) {
  const rate = 8000, bytes = seconds * rate * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40);
  return buffer;
}
test('WAV duration uses real audio length and rejects truncated audio', () => {
  const wav = makeWav(7.5);
  assert.equal(wavDuration(wav), 7.5);
  assert.equal(wavDuration(wav.subarray(0, 100)), undefined);
  assert.equal(wavDuration(Buffer.from('<html>error</html>')), undefined);
});
