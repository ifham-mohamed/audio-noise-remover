import type * as Ort from "onnxruntime-web/wasm";
import { DPDFNET_BINS, DPDFNET_WINDOW_LENGTH, spectralFrame, spectralFrameCount, reconstructDpdfnetAudio } from "@/features/preview/dpdfnet-signal";

const pinnedSha256 = "7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b";
const stateSize = 56_436;
const noisyFrameOffset = 4;

export class DpdfnetModelUnavailable extends Error {}

function readVarint(bytes: Uint8Array, cursor: { offset: number }, limit: number) {
  let value = 0;
  let multiplier = 1;
  for (let count = 0; count < 10; count++) {
    if (cursor.offset >= limit) throw new DpdfnetModelUnavailable("The installed model metadata is incomplete.");
    const octet = bytes[cursor.offset++];
    value += (octet & 0x7f) * multiplier;
    if (!(octet & 0x80)) return value;
    multiplier *= 128;
  }
  throw new DpdfnetModelUnavailable("The installed model metadata is invalid.");
}

function walkProtobuf(bytes: Uint8Array, start: number, end: number, visit: (field: number, begin: number, finish: number) => void) {
  const cursor = { offset: start };
  while (cursor.offset < end) {
    const tag = readVarint(bytes, cursor, end);
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) { readVarint(bytes, cursor, end); continue; }
    if (wire === 1 || wire === 5) { cursor.offset += wire === 1 ? 8 : 4; continue; }
    if (wire !== 2) throw new DpdfnetModelUnavailable("The installed model metadata uses an unsupported encoding.");
    const length = readVarint(bytes, cursor, end);
    const begin = cursor.offset;
    const finish = begin + length;
    if (finish > end || !Number.isSafeInteger(finish)) throw new DpdfnetModelUnavailable("The installed model metadata is truncated.");
    visit(field, begin, finish);
    cursor.offset = finish;
  }
  if (cursor.offset !== end) throw new DpdfnetModelUnavailable("The installed model metadata is truncated.");
}

export function initialDpdfnetState(model: Uint8Array): Float32Array {
  const metadata = new Map<string, string>();
  const decoder = new TextDecoder();
  walkProtobuf(model, 0, model.length, (field, begin, finish) => {
    // ONNX ModelProto.metadata_props is field 14. Each entry has key/value
    // string fields 1/2; the graph itself is skipped without decoding it.
    if (field !== 14) return;
    let key: string | undefined;
    let value: string | undefined;
    walkProtobuf(model, begin, finish, (entryField, entryBegin, entryFinish) => {
      if (entryField === 1) key = decoder.decode(model.subarray(entryBegin, entryFinish));
      if (entryField === 2) value = decoder.decode(model.subarray(entryBegin, entryFinish));
    });
    if (key !== undefined && value !== undefined) metadata.set(key, value);
  });
  const count = (key: string) => {
    const value = Number(metadata.get(key));
    if (!Number.isSafeInteger(value) || value < 0) throw new DpdfnetModelUnavailable("The installed model has invalid state metadata.");
    return value;
  };
  const total = count("state_size");
  const erbCount = count("erb_norm_state_size");
  const specCount = count("spec_norm_state_size");
  if (total !== stateSize || erbCount + specCount > total) throw new DpdfnetModelUnavailable("The installed model state does not match the pinned adapter.");
  const parseValues = (key: string, length: number) => {
    const values = metadata.get(key)?.split(",").map((item) => Number(item.trim()));
    if (!values || values.length !== length || values.some((value) => !Number.isFinite(value))) throw new DpdfnetModelUnavailable("The installed model state initialization is invalid.");
    return values;
  };
  const state = new Float32Array(total);
  state.set(parseValues("erb_norm_init", erbCount), 0);
  state.set(parseValues("spec_norm_init", specCount), erbCount);
  return state;
}

async function loadModel() {
  const response = await fetch(new URL("/api/preview-model", self.location.origin), { cache: "no-store" });
  if (!response.ok) throw new DpdfnetModelUnavailable("The pinned experimental speech model is not installed or did not pass its checksum check. Run local model setup, then retry.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = [...digest].map((octet) => octet.toString(16).padStart(2, "0")).join("");
  if (sha256 !== pinnedSha256) throw new DpdfnetModelUnavailable("The installed speech model does not match the pinned experimental version. Run local model setup before retrying.");
  return bytes;
}

export async function enhanceWithDpdfnet(
  samples: Float32Array,
  intensity: number,
  isCancelled: () => boolean,
  onProgress: (fraction: number) => void,
): Promise<Float32Array> {
  if (!Number.isFinite(intensity) || intensity <= 0 || intensity > 100) throw new DpdfnetModelUnavailable("Set noise removal above zero to make an experimental enhanced preview.");
  const modelBytes = await loadModel();
  if (isCancelled()) throw new Error("Preview cancelled.");
  const initialState = initialDpdfnetState(modelBytes);
  const ort: typeof Ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = new URL("/onnxruntime/", self.location.origin).href;
  let session: Ort.InferenceSession | undefined;
  try {
    session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });
    const specInput = session.inputMetadata[0];
    if (session.inputNames.join(",") !== "spec,state_in" || session.outputNames.join(",") !== "spec_e,state_out" || !specInput?.isTensor || specInput.shape.at(-2) !== DPDFNET_BINS) {
      throw new DpdfnetModelUnavailable("The installed model graph does not match the pinned experimental adapter.");
    }
    const padded = new Float32Array(samples.length + DPDFNET_WINDOW_LENGTH);
    padded.set(samples);
    const frameCount = spectralFrameCount(samples.length);
    const enhancedFrames: Float32Array[] = [];
    const noisyHistory: Float32Array[] = [];
    let state = initialState;
    let lastProgressFrame = -1;
    let lastProgressAt = 0;
    // The visible intensity maps to the publisher's offline attenuation limit:
    // 60% -> 12 dB, 100% -> 20 dB. It is an experimental control mapping.
    const noisyMix = 10 ** (-(intensity / 5) / 20);
    for (let frame = 0; frame < frameCount; frame++) {
      if (isCancelled()) throw new Error("Preview cancelled.");
      const noisy = spectralFrame(padded, frame);
      noisyHistory.push(noisy);
      const output = await session.run({
        spec: new ort.Tensor("float32", noisy, [1, 1, DPDFNET_BINS, 2]),
        state_in: new ort.Tensor("float32", state, [stateSize]),
      });
      const enhanced = output.spec_e?.data;
      const nextState = output.state_out?.data;
      if (!(enhanced instanceof Float32Array) || enhanced.length !== DPDFNET_BINS * 2 || !(nextState instanceof Float32Array) || nextState.length !== stateSize) throw new Error("The experimental model returned invalid audio or state.");
      const alignedNoisy = frame >= noisyFrameOffset ? noisyHistory[frame - noisyFrameOffset] : undefined;
      const blended = new Float32Array(enhanced.length);
      for (let index = 0; index < blended.length; index++) {
        blended[index] = (1 - noisyMix) * enhanced[index] + noisyMix * (alignedNoisy?.[index] ?? 0);
        if (!Number.isFinite(blended[index])) throw new Error("The experimental model returned invalid samples.");
      }
      enhancedFrames.push(blended);
      state = nextState;
      if (frame % 4 === 0 || frame === frameCount - 1) {
        const currentTime = performance.now();
        if (frame === 0 || frame === frameCount - 1 || ((frame - lastProgressFrame) / frameCount >= 0.02 && currentTime - lastProgressAt >= 150)) {
          onProgress((frame + 1) / frameCount);
          lastProgressFrame = frame;
          lastProgressAt = currentTime;
        }
        // Yield to the worker task queue so a cancel message can interrupt
        // repeated WASM calls rather than wait for the whole preview.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    if (isCancelled()) throw new Error("Preview cancelled.");
    return reconstructDpdfnetAudio(enhancedFrames, samples.length);
  } finally {
    await session?.release();
  }
}
