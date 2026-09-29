/// <reference lib="webworker" />

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { MAX_PREVIEW_INPUT_BYTES } from "@/shared/contracts/preview";
import { buildPreviewDecodeArgs, isPreviewInputSizeAllowed } from "@/features/preview/preview-worker-utils";

type WorkerRequest =
  | { type: "start"; jobId: string; file: File; range: { startSeconds: number; endSeconds: number }; audioStreamIndex: number; enabledStages: string[] }
  | { type: "cancel" };

let cancelled = false;
let activeFfmpeg: FFmpeg | undefined;

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

  const ffmpeg = new FFmpeg();
  activeFfmpeg = ffmpeg;
  let inputWritten = false;
  let outputWritten = false;
  let lastProgress = 0.25;
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (cancelled || !Number.isFinite(progress)) return;
    lastProgress = Math.max(lastProgress, Math.min(0.9, 0.25 + progress * 0.65));
    emit({ type: "progress", phase: "Extracting preview audio", progress: lastProgress, elapsedMs: elapsed() });
  };
  const inputPath = `/input.${extension}`;
  const outputPath = "/preview-decoded.wav";
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
    outputWritten = true;
    if (cancelled) {
      return { type: "cancelled", elapsedMs: elapsed() };
    }
    if (exitCode !== 0) {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "UNSUPPORTED_MEDIA", message: "This file’s audio codec or stream layout is not supported by the installed local media tools.", action: "retry" } };
    }

    const decoded = await ffmpeg.readFile(outputPath);
    outputWritten = true;
    if (typeof decoded === "string" || decoded.byteLength < 44 || String.fromCharCode(...decoded.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...decoded.subarray(8, 12)) !== "WAVE") {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "PROCESSING_FAILED", message: "The local media tools did not produce a valid preview audio stream. The source was left unchanged.", action: "retry" } };
    }

    // Decoding alone is never represented as enhancement. All enabled stages must
    // have qualified adapters before a playable artifact can be published.
    const enabledStages = new Set(request.enabledStages);
    if (enabledStages.has("noise-removal")) {
      return { type: "failed", elapsedMs: elapsed(), failure: { code: "MODEL_UNAVAILABLE", message: "Local audio decoding is ready, but the speech enhancement model has not passed its quality gate. No enhanced preview was published.", action: "settings" } };
    }
    return { type: "failed", elapsedMs: elapsed(), failure: { code: "MODEL_UNAVAILABLE", message: "One or more enabled enhancement stages do not have a qualified local adapter. No preview was published.", action: "settings" } };
  } catch {
    if (cancelled) {
      return { type: "cancelled", elapsedMs: elapsed() };
    }
    return { type: "failed", elapsedMs: elapsed(), failure: { code: "RUNTIME_UNAVAILABLE", message: "The bundled local media tools could not run. Open diagnostics and try again.", action: "diagnostics" } };
  } finally {
    if (activeFfmpeg === ffmpeg) activeFfmpeg = undefined;
    if (ffmpeg.loaded) {
      ffmpeg.off("progress", onFfmpegProgress);
      if (outputWritten) await ffmpeg.deleteFile(outputPath).catch(() => undefined);
      if (inputWritten) await ffmpeg.deleteFile(inputPath).catch(() => undefined);
    }
    ffmpeg.terminate();
  }
  })();
  emit(terminalEvent);
};

export {};
