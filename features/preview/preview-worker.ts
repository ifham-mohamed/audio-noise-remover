/// <reference lib="webworker" />

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { MAX_PREVIEW_INPUT_BYTES } from "@/shared/contracts/preview";
import { buildPreviewDecodeArgs, isPreviewInputSizeAllowed, isPreviewResourceExhaustion } from "@/features/preview/preview-worker-utils";
import { processingStageSchema, type ProcessingStage } from "@/shared/contracts/processing";
import { DpdfnetModelUnavailable, enhanceWithDpdfnet } from "@/features/preview/dpdfnet-adapter";
import { decodeFloatWav, packFloatWavForFfmpeg } from "@/features/preview/dpdfnet-signal";

type WorkerRequest =
  | { type: "start"; jobId: string; file: File; range: { startSeconds: number; endSeconds: number }; audioStreamIndex: number; enabledStages: ProcessingStage[] }
  | { type: "cancel" };

let cancelled = false;
let activeFfmpeg: FFmpeg | undefined;
class InvalidEnhancedPreview extends Error {}

function assertEnhancedAudio(source: Float32Array, output: Float32Array) {
  if (!output.length || output.length !== source.length) throw new InvalidEnhancedPreview();
  let peak = 0;
  let differenceEnergy = 0;
  for (let index = 0; index < output.length; index++) {
    const value = output[index];
    if (!Number.isFinite(value)) throw new InvalidEnhancedPreview();
    peak = Math.max(peak, Math.abs(value));
    const difference = value - source[index];
    differenceEnergy += difference * difference;
  }
  if (peak <= 1e-6 || peak >= 1 || Math.sqrt(differenceEnergy / output.length) <= 1e-6) throw new InvalidEnhancedPreview();
}

self.onmessage = async (message: MessageEvent<WorkerRequest>) => {
  const request = message.data;
  if (request.type === "cancel") {
    cancelled = true;
    activeFfmpeg?.terminate();
    return;
  }

  cancelled = false;
  const startedAt = performance.now();
  let sequence = 0;
  const emit = (event: Record<string, unknown>) => self.postMessage({ ...event, jobId: request.jobId, sequence: ++sequence });
  const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));

  if (!(request.file instanceof File) || request.file.size === 0) {
    emit({ type: "failed", elapsedMs: 0, failure: { code: "UNSUPPORTED_MEDIA", message: "This local file could not be read. Choose another supported file.", action: "retry" } });
    return;
  }

  if (!isPreviewInputSizeAllowed(request.file.size)) {
    if (request.file.size <= MAX_PREVIEW_INPUT_BYTES) {
      emit({ type: "failed", elapsedMs: 0, failure: { code: "UNSUPPORTED_MEDIA", message: "This local file could not be read. Choose another supported file.", action: "retry" } });
      return;
    }
    emit({ type: "failed", elapsedMs: 0, failure: { code: "PROCESSING_FAILED", message: "This file is too large for a safe browser preview (maximum 256 MB). Choose a smaller file; the original has not been changed." } });
    return;
  }

  const extension = request.file.name.toLowerCase().split(".").pop();
  if (!extension || !["wav", "mp3", "flac", "m4a", "mp4", "mov", "mkv"].includes(extension)) {
    emit({ type: "failed", elapsedMs: 0, failure: { code: "UNSUPPORTED_MEDIA", message: "This file type is not supported for local preview.", action: "retry" } });
    return;
  }

  const parsedStages = processingStageSchema.array().safeParse(request.enabledStages);
  if (!parsedStages.success || parsedStages.data.some((stage) => !stage.enabled)) {
    emit({ type: "failed", elapsedMs: elapsed(), failure: { code: "PROCESSING_FAILED", message: "The selected preview effects are invalid. Review the settings and try again.", action: "settings" } });
    return;
  }
  const unsupported = parsedStages.data.find((stage) => stage.id !== "noise-removal");
  if (unsupported) {
    emit({ type: "failed", elapsedMs: elapsed(), failure: { code: "MODEL_UNAVAILABLE", message: `${unsupported.id.replaceAll("-", " ")} does not have a local preview adapter yet. Turn it off to try the experimental noise-removal preview.`, action: "effects" } });
    return;
  }
  const noiseRemoval = parsedStages.data.find((stage) => stage.id === "noise-removal");
  if (!noiseRemoval || noiseRemoval.id !== "noise-removal") {
    emit({ type: "failed", elapsedMs: elapsed(), failure: { code: "MODEL_UNAVAILABLE", message: "Enable noise removal to make an experimental enhanced preview. No decoded source audio was published.", action: "effects" } });
    return;
  }

  const ffmpeg = new FFmpeg();
  activeFfmpeg = ffmpeg;
  let inputWritten = false;
  let outputWritten = false;
  let enhancedRawWritten = false;
  let enhancedWavWritten = false;
  let lastProgress = 0.25;
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (cancelled || !Number.isFinite(progress)) return;
    lastProgress = Math.max(lastProgress, Math.min(0.45, 0.25 + progress * 0.2));
    emit({ type: "progress", phase: "Extracting preview audio", progress: lastProgress, elapsedMs: elapsed() });
  };
  const inputPath = `/input.${extension}`;
  const outputPath = "/preview-decoded.wav";
  const enhancedRawPath = "/preview-enhanced-input.wav";
  const enhancedWavPath = "/preview-enhanced.wav";
  const terminalEvent = await (async () => {
   try {
    emit({ type: "progress", phase: "Loading local media tools", progress: 0, elapsedMs: elapsed() });
    const coreBase = new URL("/ffmpeg/ffmpeg-core.js", self.location.origin);
    await ffmpeg.load({ coreURL: coreBase.href, wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", self.location.origin).href });
    if (cancelled) {
      return { type: "cancelled", elapsedMs: elapsed() };
    }

    emit({ type: "progress", phase: "Reading media locally", progress: 0.1, elapsedMs: elapsed() });
    await ffmpeg.writeFile(inputPath, new Uint8Array(await request.file.arrayBuffer()));
    inputWritten = true;
    if (cancelled) {
      return { type: "cancelled", elapsedMs: elapsed() };
    }

    emit({ type: "progress", phase: "Extracting preview audio", progress: 0.25, elapsedMs: elapsed() });
    ffmpeg.on("progress", onFfmpegProgress);
    const exitCode = await ffmpeg.exec(buildPreviewDecodeArgs(request.range, request.audioStreamIndex, inputPath, outputPath));
    // The same FFmpeg instance encodes the enhanced artifact later. Decode
    // progress must not leak into that phase and regress coordinator progress.
    ffmpeg.off("progress", onFfmpegProgress);
    outputWritten = true;
    if (cancelled) {
      return { type: "cancelled", elapsedMs: elapsed() };
    }
    if (exitCode !== 0) {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "UNSUPPORTED_MEDIA", message: "This file’s audio codec or stream layout is not supported by the installed local media tools.", action: "retry" } };
    }

    const decoded = await ffmpeg.readFile(outputPath);
    outputWritten = true;
    if (typeof decoded === "string") {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "PROCESSING_FAILED", message: "The local media tools did not produce a valid preview audio stream. The source was left unchanged.", action: "retry" } };
    }
    const samples = decodeFloatWav(decoded);
    if (cancelled) return { type: "cancelled", elapsedMs: elapsed() };
    emit({ type: "progress", phase: "Loading experimental speech model", progress: 0.46, elapsedMs: elapsed() });
    const enhanced = await enhanceWithDpdfnet(samples, noiseRemoval.parameters.intensity, () => cancelled, (fraction) => {
      if (!cancelled) emit({ type: "progress", phase: "Enhancing speech experimentally", progress: Math.max(lastProgress, 0.5 + fraction * 0.43), elapsedMs: elapsed() });
    });
    if (cancelled) return { type: "cancelled", elapsedMs: elapsed() };
    assertEnhancedAudio(samples, enhanced);
    emit({ type: "progress", phase: "Validating enhanced preview audio", progress: 0.94, elapsedMs: elapsed() });
    await ffmpeg.writeFile(enhancedRawPath, packFloatWavForFfmpeg(enhanced));
    enhancedRawWritten = true;
    const encodeExit = await ffmpeg.exec(["-i", enhancedRawPath, "-c:a", "pcm_f32le", enhancedWavPath]);
    enhancedWavWritten = true;
    if (cancelled) return { type: "cancelled", elapsedMs: elapsed() };
    if (encodeExit !== 0) throw new Error("Enhanced preview encoding failed.");
    const encoded = await ffmpeg.readFile(enhancedWavPath);
    if (typeof encoded === "string") throw new Error("Enhanced preview audio is invalid.");
    const validated = decodeFloatWav(encoded);
    if (validated.length !== enhanced.length || validated.length === 0 || validated.length / 48_000 > 30.05 || encoded.byteLength > 64 * 1024 * 1024) throw new Error("Enhanced preview audio failed validation.");
    assertEnhancedAudio(samples, validated);
    if (cancelled) return { type: "cancelled", elapsedMs: elapsed() };
    const artifactBlob = new Blob([Uint8Array.from(encoded)], { type: "audio/wav" });
    return { type: "succeeded", elapsedMs: elapsed(), artifact: { id: crypto.randomUUID(), mimeType: "audio/wav", sizeBytes: artifactBlob.size, durationSeconds: validated.length / 48_000 }, artifactBlob, artifactSource: "enhancement-adapter" };
  } catch (cause) {
    if (cancelled) {
      return { type: "cancelled", elapsedMs: elapsed() };
    }
    if (isPreviewResourceExhaustion(cause)) {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "RESOURCE_EXHAUSTED", message: "This preview ran out of available memory. Close other tabs or applications, then retry with a smaller media file.", action: "diagnostics" } };
    }
    if (cause instanceof DpdfnetModelUnavailable) {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "MODEL_UNAVAILABLE", message: cause.message, action: "settings" } };
    }
    if (cause instanceof InvalidEnhancedPreview) {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "PROCESSING_FAILED", message: "The experimental model output was silent, clipped, invalid, or unchanged. No preview was published.", action: "retry" } };
    }
    return { type: "failed", elapsedMs: elapsed(), failure: { code: "RUNTIME_UNAVAILABLE", message: "The bundled local media tools could not run. Open diagnostics and try again.", action: "diagnostics" } };
  } finally {
    if (activeFfmpeg === ffmpeg) activeFfmpeg = undefined;
    if (ffmpeg.loaded) {
      ffmpeg.off("progress", onFfmpegProgress);
      if (outputWritten) await ffmpeg.deleteFile(outputPath).catch(() => undefined);
      if (enhancedRawWritten) await ffmpeg.deleteFile(enhancedRawPath).catch(() => undefined);
      if (enhancedWavWritten) await ffmpeg.deleteFile(enhancedWavPath).catch(() => undefined);
      if (inputWritten) await ffmpeg.deleteFile(inputPath).catch(() => undefined);
    }
    ffmpeg.terminate();
  }
  })();
  emit(terminalEvent);
};

export {};
