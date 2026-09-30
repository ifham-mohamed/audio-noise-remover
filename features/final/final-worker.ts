/// <reference lib="webworker" />

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { DpdfnetModelUnavailable } from "@/features/preview/dpdfnet-adapter";
import { decodeFloatWav, packFloatWavForFfmpeg } from "@/features/preview/dpdfnet-signal";
import { validateFinalWav } from "@/features/final/final-artifact-store";
import { encodedOutputDigest, validateEncodedOutput } from "@/features/final/final-output-validation";
import { assertFinalDecodedDuration, inspectWavChannelCount } from "@/features/final/final-worker-utils";
import { assertPreservedVideo, buildFinalEncodeArgs, buildVideoFingerprintArgs, parseVideoFingerprints } from "@/features/final/final-encoding";
import { runSpeechPipeline, speechStagePhases } from "@/features/processing/speech-pipeline";
import { parseEnabledSpeechStages, outputProfileSchema } from "@/shared/contracts/processing";
import { getFinalEncodingPlan, isSafeFinalOutputName } from "@/shared/contracts/final-output";
import { formatFromFileName, kindFromFormat } from "@/shared/contracts/media";
import { experimentalFinalLimits } from "@/shared/contracts/final-job";
import { UnsupportedVideoTiming, assertSupportedSourceTimeline, assertPreservedVideoTimeline, assertEncodedAudioTimeline, buildTimedAudioDecodeArgs, createPcmTimingProbe, createVideoTimingProbe, type VideoTimeline } from "@/features/final/final-video-timing";

type Start = { type: "start"; jobId: string; file: File; sourceName: string; sourceSizeBytes: number; sourceDurationSeconds: number; audioStreamIndex: number; output: unknown; fileName: string; stages: unknown };
let busy = false;
self.onmessage = async (message: MessageEvent<Start>) => {
  const request = message.data;
  const jobId = request && typeof request.jobId === "string" ? request.jobId : undefined;
  if (!jobId || busy) return;
  busy = true;
  const started = performance.now(); let sequence = 0;
  const elapsedMs = () => Math.max(0, Math.round(performance.now() - started));
  const emit = (payload: Record<string, unknown>) => self.postMessage({ ...payload, jobId, sequence: ++sequence, elapsedMs: elapsedMs() });
  const parsedStages = parseEnabledSpeechStages(request.stages);
  const parsedOutput = outputProfileSchema.safeParse(request.output);
  const format = request.file instanceof File ? formatFromFileName(request.file.name) : undefined;
  const plan = format && parsedOutput.success ? getFinalEncodingPlan(parsedOutput.data, format) : undefined;
  if (!parsedStages.success || !parsedOutput.success || !plan || !format || !isSafeFinalOutputName(request.fileName, plan.extension)
    || request.fileName.toLowerCase() === request.sourceName.toLowerCase() || request.file.name !== request.sourceName
    || request.file.size !== request.sourceSizeBytes || request.file.size === 0 || request.file.size > experimentalFinalLimits.maxInputBytes
    || !Number.isInteger(request.audioStreamIndex) || request.audioStreamIndex < 0 || request.audioStreamIndex > 63
    || plan.video !== (kindFromFormat(format) === "video")) {
    emit({ type: "failed", failure: { code: "UNSUPPORTED_MEDIA", message: parsedStages.success ? "Review the selected media, output format, selected track, and local file limits." : parsedStages.message, action: "settings" } });
    busy = false; return;
  }
  const stages = parsedStages.data;
  const ffmpeg = new FFmpeg();
  const input = `/final-input.${format}`;
  const decodedPath = "/final-decoded.wav";
  const enhancedPath = "/final-enhanced-input.wav";
  const outputPath = `/final-output.${plan.extension}`;
  const checkPath = "/final-output-check.wav";
  const beforeHashPath = "/source-video.sha256";
  const afterHashPath = "/output-video.sha256";
  const temporaryPaths = [input, decodedPath, enhancedPath, outputPath, checkPath, beforeHashPath, afterHashPath];
  const lastStageId = stages.at(-1)!.id;
  let terminal: Record<string, unknown>;
  // Subscribe only during an evidence-producing command. Packet logs never leave
  // this worker and are not retained as media-derived telemetry.
  async function captureTiming(args: string[], probe: { log(message: string): void }) {
    const listener = ({ message }: { message: string }) => probe.log(message);
    ffmpeg.on("log", listener);
    try { return await ffmpeg.exec(args); }
    finally { ffmpeg.off("log", listener); }
  }
  try {
    if (format === "wav") inspectWavChannelCount(new Uint8Array(await request.file.slice(0, Math.min(request.file.size, 1024 * 1024)).arrayBuffer()));
    emit({ type: "progress", phase: "Loading local media tools", stageId: stages[0]!.id, progress: 0.01 });
    await ffmpeg.load({ coreURL: new URL("/ffmpeg/ffmpeg-core.js", self.location.origin).href, wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", self.location.origin).href });
    await ffmpeg.writeFile(input, new Uint8Array(await request.file.arrayBuffer()));
    let beforeVideo: string[] | undefined;
    let sourceVideoTimeline: VideoTimeline | undefined;
    if (plan.video) {
      const probe = createVideoTimingProbe();
      if (await captureTiming(buildVideoFingerprintArgs(input, beforeHashPath), probe) !== 0) throw new UnsupportedVideoTiming("original video packet timestamps could not be probed");
      sourceVideoTimeline = probe.finish();
      const hash = await ffmpeg.readFile(beforeHashPath); if (typeof hash === "string") throw new UnsupportedVideoTiming("video preservation evidence is missing");
      beforeVideo = parseVideoFingerprints(hash);
    }
    emit({ type: "progress", phase: "Decoding the selected audio locally", stageId: stages[0]!.id, progress: 0.08 });
    const audioProbe = createPcmTimingProbe();
    const decodeExit = plan.video ? await captureTiming(buildTimedAudioDecodeArgs(input, request.audioStreamIndex, decodedPath, experimentalFinalLimits.maxDurationSeconds), audioProbe) : await ffmpeg.exec(["-i", input, "-map", `0:a:${request.audioStreamIndex}`, "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", "-t", String(experimentalFinalLimits.maxDurationSeconds + 0.1), decodedPath]);
    if (decodeExit !== 0) throw new Error("The selected audio stream could not be decoded.");
    const decoded = await ffmpeg.readFile(decodedPath); if (typeof decoded === "string") throw new Error("Decoded audio data is missing.");
    const samples = decodeFloatWav(decoded); const durationSeconds = samples.length / 48_000;
    const sourceAudioTimeline = sourceVideoTimeline ? audioProbe.finish(samples.length) : undefined;
    const verifiedAudioOffset = sourceVideoTimeline ? assertSupportedSourceTimeline(sourceVideoTimeline, sourceAudioTimeline!, plan.muxer) : 0;
    assertFinalDecodedDuration(durationSeconds, request.sourceDurationSeconds, experimentalFinalLimits.maxDurationSeconds);
    const pipeline = await runSpeechPipeline(samples, stages, { onProgress: (stageId, fraction) => emit({ type: "progress", phase: stageId === "noise-removal" ? "Applying experimental noise removal" : speechStagePhases[stageId], stageId, progress: 0.12 + fraction * 0.70 }) });
    const enhanced = pipeline.samples;
    let signalDifference = 0;
    if (enhanced.length !== samples.length || enhanced.some((sample, index) => { signalDifference += Math.abs(sample - samples[index]!); return !Number.isFinite(sample) || Math.abs(sample) >= 1; }) || signalDifference < 1e-7) throw new Error("Enhanced audio failed finite-sample, changed-signal, duration, or clipping checks.");
    await ffmpeg.writeFile(enhancedPath, packFloatWavForFfmpeg(enhanced));
    emit({ type: "progress", phase: "Encoding the selected output format", stageId: lastStageId, progress: 0.85 });
    if (await ffmpeg.exec(buildFinalEncodeArgs(plan, input, enhancedPath, outputPath, verifiedAudioOffset)) !== 0) throw new Error("The requested output codec or container could not be encoded without changing the video.");
    emit({ type: "progress", phase: "Decoding and validating the final output", stageId: lastStageId, progress: 0.92 });
    const outputAudioProbe = createPcmTimingProbe();
    const checkExit = plan.video ? await captureTiming(buildTimedAudioDecodeArgs(outputPath, 0, checkPath, experimentalFinalLimits.maxDurationSeconds + 1), outputAudioProbe) : await ffmpeg.exec(["-i", outputPath, "-map", "0:a:0", "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", checkPath]);
    if (checkExit !== 0) throw new Error("Encoded output failed local audio decode validation.");
    const checkBytes = await ffmpeg.readFile(checkPath); if (typeof checkBytes === "string") throw new Error("Encoded audio validation missing.");
    const check = decodeFloatWav(checkBytes);
    if (plan.video) assertEncodedAudioTimeline(outputAudioProbe.finish(check.length), plan.muxer, sourceAudioTimeline!.firstSample);
    if (!check.length || Math.abs(check.length / 48_000 - durationSeconds) > 0.05 || check.some((sample) => !Number.isFinite(sample) || Math.abs(sample) >= 1)) throw new Error("Encoded output failed duration, finite-sample, or clipping validation.");
    if (beforeVideo) {
      const outputVideoProbe = createVideoTimingProbe();
      if (await captureTiming(buildVideoFingerprintArgs(outputPath, afterHashPath), outputVideoProbe) !== 0) throw new UnsupportedVideoTiming("output video packet timestamps could not be probed");
      assertPreservedVideoTimeline(sourceVideoTimeline!, outputVideoProbe.finish());
      const afterHash = await ffmpeg.readFile(afterHashPath); if (typeof afterHash === "string") throw new Error("Output video evidence missing.");
      assertPreservedVideo(beforeVideo, parseVideoFingerprints(afterHash));
    }
    const encoded = await ffmpeg.readFile(outputPath); if (typeof encoded === "string") throw new Error("FFmpeg did not produce an output file.");
    const outputBlob = new Blob([Uint8Array.from(encoded)], { type: plan.mimeType });
    const artifactId = crypto.randomUUID();
    const metadata = { artifactId, fileName: request.fileName, mimeType: plan.mimeType, sha256: await encodedOutputDigest(outputBlob), sizeBytes: outputBlob.size, durationSeconds, validated: true as const };
    const artifact = plan.mimeType === "audio/wav" ? await validateFinalWav(outputBlob, metadata) : await validateEncodedOutput(outputBlob, metadata);
    terminal = { type: "succeeded", metrics: pipeline.metrics, artifact: { ...artifact, blob: outputBlob, mediaValidated: true, experimental: true } };
  } catch (cause) {
    const modelMissing = cause instanceof DpdfnetModelUnavailable;
    const resourceExhausted = cause instanceof Error && /memory|allocation|out of memory|quota/i.test(cause.message);
    const unsupported = cause instanceof UnsupportedVideoTiming || cause instanceof Error && /selected audio stream|selected source|WAV contains|format header|mono or stereo|duration.*does not match|safe \d+-second|preservation is unsupported/.test(cause.message);
    terminal = { type: "failed", failure: { code: modelMissing ? "MODEL_UNAVAILABLE" : resourceExhausted ? "RESOURCE_EXHAUSTED" : unsupported ? "UNSUPPORTED_MEDIA" : "PROCESSING_FAILED", message: modelMissing ? "The pinned experimental model is unavailable or failed verification. Set it up locally, then retry." : cause instanceof Error ? `${cause.message} No final output was published.` : "Local final processing failed validation.", action: unsupported ? "settings" : "diagnostics" } };
  } finally {
    if (ffmpeg.loaded) for (const path of temporaryPaths) await ffmpeg.deleteFile(path).catch(() => undefined);
    ffmpeg.terminate(); busy = false;
  }
  emit(terminal);
};
