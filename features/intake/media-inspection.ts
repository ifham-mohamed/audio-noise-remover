import { formatFromFileName, kindFromFormat, MAX_MEDIA_INSPECTION_BYTES, mediaInspectionSchema, supportedMediaFormats, type MediaInspection } from "@/shared/contracts/media";

const INSPECTION_TIMEOUT_MS = 60_000;

type WorkerResult =
  | { status: "ready"; durationSeconds: number; mediaKind: "audio" | "video"; audioStreams: Array<{ id?: string; label?: string; ffmpegAudioOrdinal?: number; present: true; summary: string; channels?: number; channelLayout?: string; sampleRate?: number }> }
  | { status: "error"; code: "CORRUPT_MEDIA" | "NO_AUDIO_STREAM" | "INSPECTION_UNAVAILABLE" };

function error(code: "UNSUPPORTED_MEDIA" | "CORRUPT_MEDIA" | "NO_AUDIO_STREAM" | "INSPECTION_UNAVAILABLE" | "MEDIA_TOO_LARGE", message: string): MediaInspection {
  return mediaInspectionSchema.parse({ status: "error", code, message, supportedFormats: code === "UNSUPPORTED_MEDIA" ? [...supportedMediaFormats] : undefined });
}

function probeInWorker(file: File): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./media-probe-worker.ts", import.meta.url), { type: "module", name: "local-media-inspection" });
    } catch (cause) {
      reject(cause);
      return;
    }
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      worker.terminate();
      callback();
    };
    timeout = setTimeout(() => finish(() => reject(new Error("Local media inspection timed out."))), INSPECTION_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const result = event.data as WorkerResult;
      if (result?.status === "ready" || result?.status === "error") finish(() => resolve(result));
      else finish(() => reject(new Error("Local media inspection returned an invalid result.")));
    };
    worker.onerror = () => finish(() => reject(new Error("Local media inspection could not start.")));
    try { worker.postMessage({ file }); }
    catch (cause) { finish(() => reject(cause)); }
  });
}

const safeMessages = {
  CORRUPT_MEDIA: "Clearwave could not read or decode this file. Replace it with a readable supported media file.",
  NO_AUDIO_STREAM: "Clearwave could not find a usable audio stream in this file. Choose a file that contains readable audio.",
  INSPECTION_UNAVAILABLE: "Local media inspection is unavailable. Open diagnostics to check the bundled media tools, then try again.",
  MEDIA_TOO_LARGE: `This file is larger than the ${Math.round(MAX_MEDIA_INSPECTION_BYTES / (1024 * 1024))} MiB local inspection limit. Choose a smaller file.`,
} as const;

export async function inspectLocalMedia(file: File): Promise<MediaInspection> {
  const format = formatFromFileName(file.name);
  if (!format) return error("UNSUPPORTED_MEDIA", "This file type is not supported. Choose an MP3, WAV, M4A, FLAC, MP4, MOV, or MKV file.");
  if (file.size === 0) return error("CORRUPT_MEDIA", safeMessages.CORRUPT_MEDIA);
  if (file.size > MAX_MEDIA_INSPECTION_BYTES) return error("MEDIA_TOO_LARGE", safeMessages.MEDIA_TOO_LARGE);

  try {
    const result = await probeInWorker(file);
    if (result.status === "error") return error(result.code, safeMessages[result.code]);
    const audioStreams = result.audioStreams;
    const firstUsable = audioStreams[0];
    if (result.mediaKind !== kindFromFormat(format) || !firstUsable?.present || !firstUsable.id || audioStreams.some((stream) => !stream.id || stream.ffmpegAudioOrdinal === undefined)) return error("CORRUPT_MEDIA", safeMessages.CORRUPT_MEDIA);
    return mediaInspectionSchema.parse({
      status: "ready",
      metadata: {
        sourceName: file.name,
        sourceRef: `local:${file.name}:${file.size}:${file.lastModified}`,
        format,
        mediaKind: result.mediaKind,
        sizeBytes: file.size,
        durationSeconds: result.durationSeconds,
        audioStream: firstUsable,
        audioStreams,
        selectedAudioStreamId: firstUsable.id,
      },
    });
  } catch {
    return error("INSPECTION_UNAVAILABLE", safeMessages.INSPECTION_UNAVAILABLE);
  }
}
