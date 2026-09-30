import { z } from "zod";
import type { OutputProfile } from "@/shared/contracts/processing";

export const finalOutputMimeSchema = z.enum(["audio/wav", "audio/flac", "audio/mpeg", "audio/mp4", "video/mp4", "video/quicktime", "video/x-matroska"]);
export type FinalOutputMime = z.infer<typeof finalOutputMimeSchema>;
export const finalOutputDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const speechStageMetricsSchema = z.record(z.string(), z.record(z.string(), z.union([z.number().finite(), z.string(), z.boolean(), z.null()])));
export type SpeechStageMetrics = z.infer<typeof speechStageMetricsSchema>;
export type FinalEncodingPlan = { extension: string; mimeType: FinalOutputMime; codec: string; muxer: string; video: boolean };

export function finalOutputLabel(mimeType: string): string {
  return ({ "audio/wav": "WAV", "audio/flac": "FLAC", "audio/mpeg": "MP3", "audio/mp4": "M4A", "video/mp4": "MP4", "video/quicktime": "MOV", "video/x-matroska": "MKV" } as Record<string, string>)[mimeType] ?? "output";
}

export function getFinalEncodingPlan(output: OutputProfile, sourceFormat: string): FinalEncodingPlan | undefined {
  if (output.sampleRate !== 48_000) return undefined;
  if (output.mediaKind === "audio") {
    if (output.format === "audio-wav" && output.audioCodec === "pcm_s24le") return { extension: "wav", mimeType: "audio/wav", codec: "pcm_s24le", muxer: "wav", video: false };
    if (output.format === "audio-flac" && output.audioCodec === "flac") return { extension: "flac", mimeType: "audio/flac", codec: "flac", muxer: "flac", video: false };
    if (output.format === "audio-mp3" && output.audioCodec === "mp3" && output.audioBitrateKbps === 192) return { extension: "mp3", mimeType: "audio/mpeg", codec: "libmp3lame", muxer: "mp3", video: false };
    if (output.format === "audio-m4a" && output.audioCodec === "aac" && output.audioBitrateKbps === 192) return { extension: "m4a", mimeType: "audio/mp4", codec: "aac", muxer: "ipod", video: false };
    return undefined;
  }
  if (output.audioCodec !== "aac" || output.audioBitrateKbps !== 192 || !["source", "h264"].includes(output.videoCodec ?? "")) return undefined;
  const extension = output.format === "mp4" ? "mp4" : output.format === "source-video" ? sourceFormat : undefined;
  if (extension === "mp4") return { extension, mimeType: "video/mp4", codec: "aac", muxer: "mp4", video: true };
  if (extension === "mov") return { extension, mimeType: "video/quicktime", codec: "aac", muxer: "mov", video: true };
  if (extension === "mkv") return { extension, mimeType: "video/x-matroska", codec: "aac", muxer: "matroska", video: true };
  return undefined;
}

export function isSafeFinalOutputName(name: string, extension: string): boolean {
  return name === name.trim() && name.length > extension.length + 1 && name.length <= 180
    && !/[\\/<>:"|?*\u0000-\u001f]/.test(name) && !/[. ]$/.test(name)
    && name.toLowerCase().endsWith(`.${extension}`)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
