import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import console from "node:console";
import { URL } from "node:url";

const coreJsPath = new URL("../public/ffmpeg/ffmpeg-core.js", import.meta.url);
const coreWasmPath = new URL("../public/ffmpeg/ffmpeg-core.wasm", import.meta.url);
const coreWasm = new Uint8Array(await readFile(coreWasmPath));
if (coreWasm.byteLength === 0) throw new Error("Bundled FFmpeg WebAssembly core is empty.");

// The generated core is compiled for workers. These globals provide the small
// worker environment needed to exercise the exact checked-in WASM in Node.
globalThis.self = globalThis;
globalThis.location = { href: "http://localhost/ffmpeg/ffmpeg-core.js" };
globalThis.document = {};
const wasmURL = coreWasmPath.href;
const { default: createCore } = await import(coreJsPath.href);
const core = await createCore({
  wasmBinary: coreWasm,
  mainScriptUrlOrBlob: `${globalThis.location.href}#${Buffer.from(JSON.stringify({ wasmURL, workerURL: "" })).toString("base64")}`,
});

const sampleRate = 48_000;
const pcm = Buffer.alloc(sampleRate * 2);
for (let sample = 0; sample < sampleRate; sample += 1) {
  pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * sample) / sampleRate) * 12_000), sample * 2);
}
const wavHeader = Buffer.alloc(44);
wavHeader.write("RIFF", 0);
wavHeader.writeUInt32LE(36 + pcm.byteLength, 4);
wavHeader.write("WAVEfmt ", 8);
wavHeader.writeUInt32LE(16, 16);
wavHeader.writeUInt16LE(1, 20);
wavHeader.writeUInt16LE(1, 22);
wavHeader.writeUInt32LE(sampleRate, 24);
wavHeader.writeUInt32LE(sampleRate * 2, 28);
wavHeader.writeUInt16LE(2, 32);
wavHeader.writeUInt16LE(16, 34);
wavHeader.write("data", 36);
wavHeader.writeUInt32LE(pcm.byteLength, 40);

try {
  core.FS.writeFile("/fixture.wav", new Uint8Array(Buffer.concat([wavHeader, pcm])));
  core.exec(
    "-nostdin", "-y", "-ss", "0.2", "-i", "/fixture.wav", "-t", "0.5",
    "-map", "0:a:0", "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "2",
    "-c:a", "pcm_f32le", "/decoded.wav",
  );
  const decoded = core.FS.readFile("/decoded.wav");
  const signature = String.fromCharCode(...decoded.subarray(0, 4));
  const format = String.fromCharCode(...decoded.subarray(8, 12));
  if (core.ret !== 0 || signature !== "RIFF" || format !== "WAVE" || decoded.byteLength <= 44) {
    throw new Error(`Local WAV decode/trim validation failed (exit=${core.ret}, bytes=${decoded.byteLength}).`);
  }
  const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  console.log(`Decoded WAV format tag ${view.getUint16(20, true)}, channels ${view.getUint16(22, true)}, bits ${view.getUint16(34, true)}.`);
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= decoded.byteLength;) {
    const chunkName = String.fromCharCode(...decoded.subarray(offset, offset + 4));
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkName === "data") dataBytes = chunkSize;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const durationSeconds = dataBytes / (48_000 * 2 * 4);
  if (Math.abs(durationSeconds - 0.5) > 0.01) {
    throw new Error(`Trimmed preview duration was unexpected (${durationSeconds} seconds).`);
  }
  console.log(`Bundled local FFmpeg core passed WAV decode, range trim, resample, and WAV validation (${decoded.byteLength} bytes, ${durationSeconds.toFixed(3)} s).`);

  core.FS.writeFile("/experimental-input.wav", decoded);
  core.exec("-i", "/experimental-input.wav", "-map", "0:a:0", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", "/experimental-output.wav");
  const finalOutput = core.FS.readFile("/experimental-output.wav");
  const outputView = new DataView(finalOutput.buffer, finalOutput.byteOffset, finalOutput.byteLength);
  const outputFormatTag = outputView.getUint16(20, true);
  const outputPcmSubformat = outputFormatTag === 0xfffe && outputView.getUint32(44, true) === 1;
  const outputPcm = outputFormatTag === 1 || outputPcmSubformat;
  if (core.ret !== 0 || String.fromCharCode(...finalOutput.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...finalOutput.subarray(8, 12)) !== "WAVE" || !outputPcm || outputView.getUint16(22, true) !== 1 || outputView.getUint32(24, true) !== 48_000 || outputView.getUint16(34, true) !== 24) {
    throw new Error(`Bundled local FFmpeg core failed final PCM24 WAV encoding (exit=${core.ret}, bytes=${finalOutput.byteLength}).`);
  }
  console.log(`Bundled local FFmpeg core passed complete WAV-to-PCM24-WAV encoding (${finalOutput.byteLength} bytes).`);
  core.FS.unlink("/experimental-output.wav");
  core.FS.unlink("/experimental-input.wav");
  core.FS.unlink("/decoded.wav");
  core.FS.unlink("/fixture.wav");
  if (core.FS.readdir("/").some((entry) => ["decoded.wav", "fixture.wav", "experimental-output.wav", "experimental-input.wav"].includes(entry))) {
    throw new Error("Temporary in-memory media was not cleaned up after the processing check.");
  }
} finally {
  core.reset();
}
