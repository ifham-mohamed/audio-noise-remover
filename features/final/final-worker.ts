/// <reference lib="webworker" />

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { enhanceWithDpdfnet, DpdfnetModelUnavailable } from "@/features/preview/dpdfnet-adapter";
import { decodeFloatWav, packFloatWavForFfmpeg } from "@/features/preview/dpdfnet-signal";
import { validateFinalWav } from "@/features/final/final-artifact-store";
import { inspectWavChannelCount } from "@/features/final/final-worker-utils";
import { applyVoiceClarity } from "@/features/processing/voice-clarity";
import { parseEnabledSpeechStages } from "@/shared/contracts/processing";

type Start = { type: "start"; jobId: string; file: File; sourceName: string; sourceSizeBytes: number; sourceDurationSeconds: number; fileName: string; stages: unknown };
type Request = Start;

self.onmessage = async (message: MessageEvent<Request>) => {
  const request = message.data;
  const jobId = request && typeof request.jobId === "string" ? request.jobId : undefined;
  if (!jobId) return;
  const started = performance.now(); let sequence = 0;
  const elapsedMs = () => Math.max(0, Math.round(performance.now() - started));
  const emit = (payload: Record<string, unknown>) => self.postMessage({ ...payload, jobId, sequence: ++sequence, elapsedMs: elapsedMs() });
  const parsedStages = parseEnabledSpeechStages(request.stages);
  if (!parsedStages.success) {
    emit({ type: "failed", failure: { code: "PROCESSING_FAILED", message: `${parsedStages.message} Your source remains unchanged.`, action: "effects" } }); return;
  }
  const stages = parsedStages.data;
  if (stages.length === 1 && stages[0]?.id === "voice-clarity" && stages[0].parameters.intensity === 0) {
    emit({ type: "failed", failure: { code: "PROCESSING_FAILED", message: "Set voice clarity above zero before starting final processing. Your source remains unchanged.", action: "effects" } }); return;
  }
  if (!(request.file instanceof File) || request.file.name !== request.sourceName || request.file.name.toLowerCase().split(".").pop() !== "wav" || request.file.size !== request.sourceSizeBytes || request.file.size === 0 || request.file.size > 128 * 1024 * 1024) {
    emit({ type: "failed", failure: { code: "UNSUPPORTED_MEDIA", message: "This experimental export supports WAV files up to 128 MB. Your source remains unchanged.", action: "settings" } }); return;
  }
  const ffmpeg = new FFmpeg();
  const extension = request.file.name.toLowerCase().split(".").pop();
  const input = `/final-input.${extension}`; const decodedPath = "/final-decoded.wav"; const enhancedPath = "/final-enhanced-input.wav"; const outputPath = "/final-output.wav";
  let wroteInput = false; let wroteDecoded = false; let wroteEnhanced = false; let wroteOutput = false;
  const lastStageId = stages.at(-1)!.id;
  const onProgress = ({ progress }: { progress: number }) => { if (Number.isFinite(progress)) emit({ type: "progress", phase: "Encoding validated WAV output", stageId: lastStageId, progress: Math.max(0.85, Math.min(0.97, 0.85 + progress * 0.12)) }); };
  try {
    inspectWavChannelCount(new Uint8Array(await request.file.slice(0, Math.min(request.file.size, 1024 * 1024)).arrayBuffer()));
    emit({ type: "progress", phase: "Loading local media tools", stageId: stages[0]!.id, progress: 0.01 });
    const base = new URL("/ffmpeg/ffmpeg-core.js", self.location.origin);
    await ffmpeg.load({ coreURL: base.href, wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", self.location.origin).href });
    await ffmpeg.writeFile(input, new Uint8Array(await request.file.arrayBuffer())); wroteInput = true;
    emit({ type: "progress", phase: "Decoding the complete WAV locally", stageId: stages[0]!.id, progress: 0.08 });
    const decodeExit = await ffmpeg.exec(["-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", decodedPath]); wroteDecoded = true;
    if (decodeExit !== 0) throw new Error("WAV decoding failed.");
    const decoded = await ffmpeg.readFile(decodedPath); if (typeof decoded === "string") throw new Error("Decoded WAV data is missing.");
    const samples = decodeFloatWav(decoded); const durationSeconds = samples.length / 48_000;
    if (!durationSeconds || durationSeconds > 120 || Math.abs(durationSeconds - request.sourceDurationSeconds) > 0.05 || durationSeconds > 0.05 && request.file.size / durationSeconds < 1) throw new Error("The WAV duration or audio data does not match the selected source or exceeds the safe 120-second experimental limit.");
    let enhanced = samples;
    const noiseRemoval = stages.find((stage) => stage.id === "noise-removal");
    if (noiseRemoval) {
      emit({ type: "progress", phase: "Applying experimental noise removal", stageId: noiseRemoval.id, progress: 0.12 });
      enhanced = await enhanceWithDpdfnet(enhanced, noiseRemoval.parameters.intensity, () => false, (fraction) => { emit({ type: "progress", phase: "Applying experimental noise removal", stageId: noiseRemoval.id, progress: Math.min(stages.some((stage) => stage.id === "voice-clarity") ? 0.58 : 0.84, 0.12 + fraction * (stages.some((stage) => stage.id === "voice-clarity") ? 0.46 : 0.72)) }); });
    }
    const voiceClarity = stages.find((stage) => stage.id === "voice-clarity");
    if (voiceClarity) {
      emit({ type: "progress", phase: "Applying voice clarity", stageId: voiceClarity.id, progress: 0.62 });
      enhanced = applyVoiceClarity(enhanced, 48_000, voiceClarity.parameters.intensity);
    }
    let signalDifference = 0;
    if (enhanced.length !== samples.length || enhanced.some((sample, index) => { signalDifference += Math.abs(sample - samples[index]!); return !Number.isFinite(sample) || Math.abs(sample) >= 1; }) || signalDifference < 1e-7) throw new Error("Enhanced audio failed finite-sample, changed-signal, duration, or clipping checks.");
    await ffmpeg.writeFile(enhancedPath, packFloatWavForFfmpeg(enhanced)); wroteEnhanced = true;
    ffmpeg.on("progress", onProgress);
    emit({ type: "progress", phase: "Encoding validated WAV output", stageId: lastStageId, progress: 0.85 });
    const encodeExit = await ffmpeg.exec(["-i", enhancedPath, "-map", "0:a:0", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", outputPath]); wroteOutput = true;
    ffmpeg.off("progress", onProgress);
    if (encodeExit !== 0) throw new Error("FFmpeg could not encode the requested WAV profile.");
    const encoded = await ffmpeg.readFile(outputPath); if (typeof encoded === "string") throw new Error("FFmpeg did not produce an output file.");
    const outputBlob = new Blob([Uint8Array.from(encoded)], { type: "audio/wav" });
    const artifactId = crypto.randomUUID();
    const artifact = await validateFinalWav(outputBlob, { artifactId, fileName: request.fileName, mimeType: "audio/wav", sizeBytes: outputBlob.size, durationSeconds, validated: true });
    emit({ type: "succeeded", artifact: { artifactId, blob: outputBlob, fileName: artifact.fileName, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes, durationSeconds: artifact.durationSeconds, mediaValidated: true, experimental: true } });
  } catch (cause) {
    const modelMissing = cause instanceof DpdfnetModelUnavailable;
    const resourceExhausted = cause && typeof cause === "object" && ("name" in cause && cause.name === "QuotaExceededError" || "message" in cause && typeof cause.message === "string" && /memory|allocation|out of memory|quota/i.test(cause.message));
    const sourceUnsupported = cause instanceof Error && /selected source is not|WAV contains|format header|supports only mono or stereo|duration or audio data does not match/i.test(cause.message);
    emit({ type: "failed", failure: { code: modelMissing ? "MODEL_UNAVAILABLE" : resourceExhausted ? "RESOURCE_EXHAUSTED" : sourceUnsupported ? "UNSUPPORTED_MEDIA" : "PROCESSING_FAILED", message: modelMissing ? "The pinned experimental model is unavailable or failed verification. Set it up locally, then retry." : sourceUnsupported && cause instanceof Error ? `${cause.message} Choose a supported WAV file and review local export settings.` : "Experimental final processing failed local validation. Temporary data was removed and the source remains unchanged.", action: sourceUnsupported ? "settings" : "diagnostics" } });
  } finally {
    if (ffmpeg.loaded) {
      ffmpeg.off("progress", onProgress);
      if (wroteOutput) await ffmpeg.deleteFile(outputPath).catch(() => undefined);
      if (wroteEnhanced) await ffmpeg.deleteFile(enhancedPath).catch(() => undefined);
      if (wroteDecoded) await ffmpeg.deleteFile(decodedPath).catch(() => undefined);
      if (wroteInput) await ffmpeg.deleteFile(input).catch(() => undefined);
    }
    ffmpeg.terminate();
  }
};
