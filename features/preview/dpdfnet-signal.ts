import FFT from "fft.js";

export const DPDFNET_SAMPLE_RATE = 48_000;
export const DPDFNET_WINDOW_LENGTH = 960;
export const DPDFNET_HOP_LENGTH = DPDFNET_WINDOW_LENGTH / 2;
export const DPDFNET_BINS = DPDFNET_WINDOW_LENGTH / 2 + 1;

// Bluestein's transform lets the radix-2 FFT implementation handle the
// model's 960-point window without changing its required frequency bins.
const convolutionLength = 2048;
const fft = new FFT(convolutionLength);
const chirp = new Float64Array(DPDFNET_WINDOW_LENGTH * 2);
const kernel = new Float64Array(convolutionLength * 2);
for (let index = 0; index < DPDFNET_WINDOW_LENGTH; index++) {
  const phase = Math.PI * (index * index % (2 * DPDFNET_WINDOW_LENGTH)) / DPDFNET_WINDOW_LENGTH;
  const real = Math.cos(phase);
  const imaginary = Math.sin(phase);
  chirp[index * 2] = real;
  chirp[index * 2 + 1] = -imaginary;
  kernel[index * 2] = real;
  kernel[index * 2 + 1] = imaginary;
  if (index) {
    kernel[(convolutionLength - index) * 2] = real;
    kernel[(convolutionLength - index) * 2 + 1] = imaginary;
  }
}
const kernelSpectrum = new Float64Array(convolutionLength * 2);
fft.transform(kernelSpectrum, kernel);

export function transform960(input: Float32Array | Float64Array, inverse = false): Float64Array {
  if (input.length !== DPDFNET_WINDOW_LENGTH * 2) throw new Error("Invalid DPDFNet transform length.");
  const work = new Float64Array(convolutionLength * 2);
  for (let index = 0; index < DPDFNET_WINDOW_LENGTH; index++) {
    const real = input[index * 2];
    const imaginary = inverse ? -input[index * 2 + 1] : input[index * 2 + 1];
    const cr = chirp[index * 2];
    const ci = chirp[index * 2 + 1];
    work[index * 2] = real * cr - imaginary * ci;
    work[index * 2 + 1] = real * ci + imaginary * cr;
  }
  const spectrum = new Float64Array(convolutionLength * 2);
  fft.transform(spectrum, work);
  for (let index = 0; index < convolutionLength; index++) {
    const real = spectrum[index * 2];
    const imaginary = spectrum[index * 2 + 1];
    const kr = kernelSpectrum[index * 2];
    const ki = kernelSpectrum[index * 2 + 1];
    spectrum[index * 2] = real * kr - imaginary * ki;
    spectrum[index * 2 + 1] = real * ki + imaginary * kr;
  }
  fft.inverseTransform(work, spectrum);
  const output = new Float64Array(DPDFNET_WINDOW_LENGTH * 2);
  for (let index = 0; index < DPDFNET_WINDOW_LENGTH; index++) {
    const cr = chirp[index * 2];
    const ci = chirp[index * 2 + 1];
    const real = work[index * 2] * cr - work[index * 2 + 1] * ci;
    const imaginary = work[index * 2] * ci + work[index * 2 + 1] * cr;
    output[index * 2] = inverse ? real / DPDFNET_WINDOW_LENGTH : real;
    output[index * 2 + 1] = inverse ? -imaginary / DPDFNET_WINDOW_LENGTH : imaginary;
  }
  return output;
}

const window = Float64Array.from({ length: DPDFNET_WINDOW_LENGTH }, (_, index) => {
  const sine = Math.sin(Math.PI * (index + 0.5) / DPDFNET_WINDOW_LENGTH);
  return Math.sin(Math.PI * sine * sine / 2);
});

function reflectedSample(samples: Float32Array, index: number) {
  const last = samples.length - 1;
  if (last <= 0) return samples[0] ?? 0;
  let position = index;
  while (position < 0 || position > last) position = position < 0 ? -position : 2 * last - position;
  return samples[position];
}

export function spectralFrame(samples: Float32Array, frameIndex: number): Float32Array {
  const windowed = new Float32Array(DPDFNET_WINDOW_LENGTH * 2);
  const firstSample = frameIndex * DPDFNET_HOP_LENGTH - DPDFNET_HOP_LENGTH;
  for (let index = 0; index < DPDFNET_WINDOW_LENGTH; index++) {
    windowed[index * 2] = reflectedSample(samples, firstSample + index) * window[index];
  }
  return Float32Array.from(transform960(windowed).subarray(0, DPDFNET_BINS * 2));
}

export function spectralFrameCount(sampleCount: number) {
  // The publisher pads one window of zeros before its centered STFT.
  return Math.floor((sampleCount + DPDFNET_WINDOW_LENGTH) / DPDFNET_HOP_LENGTH) + 1;
}

export function createDpdfnetAudioReconstructor(requestedSamples: number) {
  if (!Number.isSafeInteger(requestedSamples) || requestedSamples <= 0) throw new Error("Invalid requested DPDFNet output length.");
  const overlapLength = DPDFNET_WINDOW_LENGTH + DPDFNET_HOP_LENGTH;
  const summed = new Float64Array(overlapLength);
  const weight = new Float64Array(overlapLength);
  const output = new Float32Array(requestedSamples);
  let frameCount = 0;
  let finished = false;
  return {
    push(frame: Float32Array) {
      if (finished) throw new Error("The DPDFNet reconstructor is already finished.");
      if (frame.length !== DPDFNET_BINS * 2) throw new Error("Invalid DPDFNet output frame.");
      const spectrum = new Float32Array(DPDFNET_WINDOW_LENGTH * 2);
      spectrum.set(frame);
      for (let bin = 1; bin < DPDFNET_WINDOW_LENGTH / 2; bin++) {
        spectrum[(DPDFNET_WINDOW_LENGTH - bin) * 2] = spectrum[bin * 2];
        spectrum[(DPDFNET_WINDOW_LENGTH - bin) * 2 + 1] = -spectrum[bin * 2 + 1];
      }
      const time = transform960(spectrum, true);
      const start = frameCount * DPDFNET_HOP_LENGTH;
      for (let index = 0; index < DPDFNET_WINDOW_LENGTH; index++) {
        const slot = (start + index) % overlapLength;
        summed[slot] += time[index * 2] * window[index];
        weight[slot] += window[index] * window[index];
      }
      // No future frame overlaps this hop after the current frame is added.
      // Normalize it now and reuse the small overlap buffers for later frames.
      const first = DPDFNET_HOP_LENGTH + DPDFNET_WINDOW_LENGTH * 2;
      for (let index = 0; index < DPDFNET_HOP_LENGTH; index++) {
        const absolute = start + index;
        const outputIndex = absolute - first;
        const slot = absolute % overlapLength;
        if (outputIndex >= 0 && outputIndex < output.length) {
          const divisor = weight[slot];
          output[outputIndex] = divisor > 1e-8 ? summed[slot] / divisor : 0;
        }
        summed[slot] = 0;
        weight[slot] = 0;
      }
      frameCount++;
    },
    finish() {
      if (finished) throw new Error("The DPDFNet reconstructor is already finished.");
      finished = true;
      // librosa's centered ISTFT drops the first half-window; the publisher
      // then advances its model latency and pads the tail back to input size.
      const validSamples = Math.max(0, (frameCount - 1) * DPDFNET_HOP_LENGTH - DPDFNET_WINDOW_LENGTH * 2);
      output.fill(0, Math.min(validSamples, output.length));
      return output;
    }
  };
}

export function reconstructDpdfnetAudio(frames: readonly Float32Array[], requestedSamples: number): Float32Array {
  const reconstructor = createDpdfnetAudioReconstructor(requestedSamples);
  for (const frame of frames) reconstructor.push(frame);
  return reconstructor.finish();
}

export function decodeFloatWav(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || text(0) !== "RIFF" || text(8) !== "WAVE") throw new Error("Invalid decoded WAV.");
  let channels = 0;
  let sampleRate = 0;
  let floatFormat = false;
  let dataOffset = -1;
  let dataLength = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkSize = view.getUint32(offset + 4, true);
    const next = offset + 8 + chunkSize;
    if (next > bytes.length) throw new Error("Truncated decoded WAV.");
    if (text(offset) === "fmt ") {
      if (chunkSize < 16) throw new Error("Invalid decoded WAV format.");
      const tag = view.getUint16(offset + 8, true);
      const bits = view.getUint16(offset + 22, true);
      const extensibleFloatGuid = [0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];
      const extensibleFloat = tag === 0xfffe && chunkSize >= 40 && view.getUint32(offset + 32, true) === 3 && extensibleFloatGuid.every((value, index) => bytes[offset + 36 + index] === value);
      floatFormat = bits === 32 && (tag === 3 || extensibleFloat);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
    }
    if (text(offset) === "data") { dataOffset = offset + 8; dataLength = chunkSize; }
    offset = next + (chunkSize % 2);
  }
  if (!floatFormat || sampleRate !== DPDFNET_SAMPLE_RATE || ![1, 2].includes(channels) || dataOffset < 0 || dataLength < 4 * channels || dataLength % (4 * channels)) throw new Error("Decoded audio is not canonical 48 kHz float PCM.");
  const samples = new Float32Array(dataLength / (4 * channels));
  for (let index = 0; index < samples.length; index++) {
    let value = 0;
    for (let channel = 0; channel < channels; channel++) value += view.getFloat32(dataOffset + (index * channels + channel) * 4, true);
    samples[index] = value / channels;
    if (!Number.isFinite(samples[index])) throw new Error("Decoded audio contains invalid samples.");
  }
  return samples;
}

// This envelope is only the in-memory PCM handoff to the reduced FFmpeg core,
// whose WAV demuxer is present but whose raw-f32le demuxer is not. FFmpeg owns
// the final encoded artifact. Never clamp model samples here.
export function packFloatWavForFfmpeg(samples: Float32Array): Uint8Array {
  if (!samples.length) throw new Error("No enhanced PCM samples are available.");
  const bytes = new Uint8Array(44 + samples.length * 4);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index); };
  writeText(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); writeText(8, "WAVE"); writeText(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 1, true);
  view.setUint32(24, DPDFNET_SAMPLE_RATE, true); view.setUint32(28, DPDFNET_SAMPLE_RATE * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 32, true); writeText(36, "data"); view.setUint32(40, samples.length * 4, true);
  for (let index = 0; index < samples.length; index++) {
    if (!Number.isFinite(samples[index]) || Math.abs(samples[index]) >= 1) throw new Error("Enhanced PCM is nonfinite or clipped.");
    view.setFloat32(44 + index * 4, samples[index], true);
  }
  return bytes;
}
