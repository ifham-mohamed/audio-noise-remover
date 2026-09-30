import { startPreviewWorker } from "@/features/preview/preview-worker-client";
import { createPreviewJob, type PreviewEvent } from "@/shared/contracts/preview";
import type { MediaMetadata } from "@/shared/contracts/media";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import { openPreviewArtifact, releasePreviewArtifactUrl } from "@/features/preview/preview-artifact-store";

const fileInput = document.querySelector<HTMLInputElement>("#media-file")!;
const trackInput = document.querySelector<HTMLSelectElement>("#audio-track")!;
const voiceClarityInput = document.querySelector<HTMLInputElement>("#voice-clarity")!;
const runButton = document.querySelector<HTMLButtonElement>("#run-preview")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-preview")!;
const result = document.querySelector<HTMLElement>("#result")!;
const videoFormats = new Set(["mp4", "mov", "mkv"]);

function metadataFor(file: File, selectedIndex: number): MediaMetadata {
  const format = file.name.split(".").at(-1)!.toLowerCase() as MediaMetadata["format"];
  const mediaKind = videoFormats.has(format) ? "video" : "audio";
  const streams = [0, 1].map((index) => ({
    id: `audio-${index}`,
    ffmpegAudioOrdinal: index,
    label: `Audio stream ${index + 1}`,
    present: index === 0 || file.name === "two-audio-mkv.mkv",
    summary: `Audio stream ${index + 1}`,
  }));
  const selected = streams[selectedIndex] ?? streams[0];
  return {
    sourceName: file.name,
    sourceRef: `local:${file.name}:${file.size}:${file.lastModified}`,
    format,
    mediaKind,
    sizeBytes: file.size,
    durationSeconds: file.name === "ten-second.wav" ? 10 : 1,
    audioStream: selected,
    audioStreams: streams.filter((stream) => stream.present),
    selectedAudioStreamId: selected.id,
  };
}

fileInput.addEventListener("change", () => {
  result.textContent = fileInput.files?.[0] ? `Selected ${fileInput.files[0].name}` : "Waiting for a local test file.";
});

runButton.addEventListener("click", () => {
  const file = fileInput.files?.[0];
  if (!file) {
    result.textContent = "Choose a local test file first.";
    return;
  }

  const media = metadataFor(file, Number(trackInput.value));
  const profile = defaultProcessingProfile(media.sourceRef, media.selectedAudioStreamId, media.mediaKind, media.format);
  profile.stages = profile.stages.map((stage) => ({ ...stage, enabled: stage.id === "noise-removal" || (stage.id === "voice-clarity" && voiceClarityInput.checked) }));
  const job = createPreviewJob(media, profile, 0);
  result.textContent = "Running the real same-origin browser worker, FFmpeg core, and experimental CPU model…";
  result.dataset.reopened = "false";
  result.dataset.modelProgress = "false";
  cancelButton.disabled = true;
  runButton.disabled = true;

  const session = startPreviewWorker(job, file, async (event: PreviewEvent) => {
    if (event.type === "progress" && event.phase === "Enhancing speech experimentally") {
      result.dataset.modelProgress = "true";
      cancelButton.disabled = false;
    }
    if (event.type === "progress") result.dataset.lastPhase = event.phase;
    result.dataset.type = event.type;
    result.dataset.code = event.type === "failed" ? event.failure.code : "";
    result.textContent = JSON.stringify(event);
    if (event.type === "succeeded") {
      if (!event.comparisonSourceArtifact) throw new Error("Before audio metadata was not included in the successful preview.");
      const before = await openPreviewArtifact(event.comparisonSourceArtifact.id);
      const opened = await openPreviewArtifact(event.artifact.id);
      if (!before || !opened) throw new Error("The paired preview artifacts could not be reopened.");
      try {
        result.dataset.reopened = "true";
        result.dataset.sourceReopened = "true";
        result.dataset.pairDurationMatch = String(Math.abs(before.durationSeconds - opened.durationSeconds) <= 0.05);
        if (file.name === "tone.wav") {
          const context = new AudioContext({ sampleRate: 48_000 });
          try {
            const source = await context.decodeAudioData(await file.arrayBuffer());
            const outputBytes = await (await fetch(opened.url)).arrayBuffer();
            const enhanced = await context.decodeAudioData(outputBytes);
            const a = source.getChannelData(0);
            const b = enhanced.getChannelData(0);
            Object.assign(window, { __experimentalPreviewOutput: Array.from(b) });
            let error = 0;
            const count = Math.min(a.length, b.length);
            for (let index = 0; index < count; index++) error += (a[index] - b[index]) ** 2;
            result.dataset.rmsDifference = String(Math.sqrt(error / count));
          } finally { await context.close(); }
        }
      } finally { releasePreviewArtifactUrl(before.url); releasePreviewArtifactUrl(opened.url); }
    }
    if (event.type !== "progress") { runButton.disabled = false; cancelButton.disabled = true; }
    return true;
  });
  cancelButton.onclick = () => { result.dataset.cancelRequested = "true"; cancelButton.disabled = true; void session.cancel(); };
});
