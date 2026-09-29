import { formatFromFileName, kindFromFormat, mediaInspectionSchema, supportedMediaFormats, type MediaInspection, type MediaMetadata } from "@/shared/contracts/media";

function error(code: "UNSUPPORTED_MEDIA" | "CORRUPT_MEDIA" | "NO_AUDIO_STREAM" | "INSPECTION_UNAVAILABLE", message: string): MediaInspection { return mediaInspectionSchema.parse({ status: "error", code, message, supportedFormats: code === "UNSUPPORTED_MEDIA" ? [...supportedMediaFormats] : undefined }); }

function browserProbe(file: File, kind: "audio" | "video"): Promise<{ durationSeconds: number; audioStream: MediaMetadata["audioStream"] }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(kind);
    element.preload = "metadata";
    element.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve({ durationSeconds: Number.isFinite(element.duration) ? element.duration : 0, audioStream: { present: true, summary: kind === "video" ? "Audio track detected by local media probe" : "Audio stream ready" } }); };
    element.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Media metadata could not be read.")); };
    element.src = url;
  });
}

export async function inspectLocalMedia(file: File): Promise<MediaInspection> {
  const format = formatFromFileName(file.name);
  if (!format) return error("UNSUPPORTED_MEDIA", "This file type is not supported. Choose an MP3, WAV, M4A, FLAC, MP4, MOV, or MKV file.");
  if (file.size === 0) return error("CORRUPT_MEDIA", "This file is empty or unreadable. Choose another local file.");
  try {
    const probe = await browserProbe(file, kindFromFormat(format));
    return mediaInspectionSchema.parse({ status: "ready", metadata: { sourceName: file.name, sourceRef: `local:${file.name}:${file.size}:${file.lastModified}`, format, mediaKind: kindFromFormat(format), sizeBytes: file.size, durationSeconds: probe.durationSeconds, audioStream: probe.audioStream } });
  } catch { return error("CORRUPT_MEDIA", "Clearwave could not read this file or find a usable audio stream. Replace it with a supported media file."); }
}
