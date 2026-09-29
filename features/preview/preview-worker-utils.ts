import { MAX_PREVIEW_INPUT_BYTES, type PreviewJob, type PreviewRange } from "@/shared/contracts/preview";

export function isPreviewInputSizeAllowed(sizeBytes: number) {
  return Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_PREVIEW_INPUT_BYTES;
}

export function isPreviewResourceExhaustion(cause: unknown) {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { name?: unknown; message?: unknown };
  if (error.name === "QuotaExceededError") return true;
  return typeof error.message === "string" && /memory|allocation|out of memory|buffer.{0,20}(large|alloc)|quota exceeded/i.test(error.message);
}

export function getPreviewAudioStreamIndex(job: PreviewJob) {
  const selectedId = job.profile.selectedAudioStreamId ?? job.media.selectedAudioStreamId ?? job.media.audioStream.id;
  const index = job.media.audioStreams?.findIndex((stream) => stream.id === selectedId) ?? -1;
  return index >= 0 ? index : 0;
}

export function buildPreviewDecodeArgs(range: PreviewRange, audioStreamIndex: number, inputPath: string, outputPath: string) {
  return [
    "-ss", range.startSeconds.toFixed(3), "-i", inputPath,
    "-t", (range.endSeconds - range.startSeconds).toFixed(3), "-map", `0:a:${audioStreamIndex}`, "-vn", "-sn", "-dn",
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", outputPath,
  ];
}
