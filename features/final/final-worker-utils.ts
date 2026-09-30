const maxWavHeaderBytes = 1024 * 1024;

export function assertFinalDecodedDuration(durationSeconds: number, sourceDurationSeconds: number, maxDurationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > maxDurationSeconds) throw new Error(`The decoded WAV exceeds the safe ${maxDurationSeconds}-second experimental limit.`);
  if (!Number.isFinite(sourceDurationSeconds) || Math.abs(durationSeconds - sourceDurationSeconds) > 0.05) throw new Error("The decoded WAV duration does not match the selected source.");
}

export function inspectWavChannelCount(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.byteLength < 44 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") throw new Error("The selected source is not a readable RIFF/WAVE file.");
  const declaredEnd = view.getUint32(4, true) + 8;
  for (let offset = 12; offset + 8 <= bytes.byteLength && offset < declaredEnd && offset < maxWavHeaderBytes;) {
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const next = dataOffset + size + (size % 2);
    if (next > declaredEnd || next > bytes.byteLength) throw new Error("The WAV contains an invalid or truncated chunk.");
    if (text(offset, 4) === "fmt ") {
      if (size < 16 || dataOffset + size > bytes.byteLength) throw new Error("The WAV format header is incomplete or too large for safe inspection.");
      const channels = view.getUint16(dataOffset + 2, true);
      if (![1, 2].includes(channels)) throw new Error("Experimental final export supports only mono or stereo WAV audio.");
      return channels;
    }
    if (next > bytes.byteLength) throw new Error("The WAV format header is beyond the bounded local inspection range.");
    offset = next;
  }
  throw new Error("The WAV format header was not found within the bounded local inspection range.");
}
