import type { AudioStream, MediaFormat } from "@/shared/contracts/media";

export type ParsedMediaProbe = {
  durationSeconds: number;
  inputFormats: string[];
  audioStream: AudioStream;
  audioOrdinal: number;
};

const allowedInputFormats: Record<MediaFormat, string[]> = {
  mp3: ["mp3"],
  wav: ["wav"],
  m4a: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
  flac: ["flac"],
  mp4: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
  mov: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
  mkv: ["matroska", "webm"],
};

export function parseFfmpegProbeLog(log: string, format: MediaFormat, audioOrdinal = 0): ParsedMediaProbe | undefined {
  const input = log.match(/Input #0,\s*([^,]+(?:,\s*[^,]+)*),\s*from\s*['"]/i)?.[1];
  if (!input) return undefined;
  const inputFormats = input.split(",").map((name) => name.trim().toLowerCase());
  if (!allowedInputFormats[format].some((name) => inputFormats.includes(name))) return undefined;

  const durationText = log.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!durationText) return undefined;
  const durationSeconds = Number(durationText[1]) * 3600 + Number(durationText[2]) * 60 + Number(durationText[3]);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;

  const audioPattern = /Stream #0:(\d+)(?:\[[^\]]+\])?(?:\([^)]*\))?:\s*Audio:\s*([^,\r\n]+),\s*(\d+)\s*Hz,\s*([^,\r\n]+)/gi;
  const audio = [...log.matchAll(audioPattern)][audioOrdinal];
  if (!audio) return undefined;
  const globalStreamIndex = Number(audio[1]);
  const codec = audio[2].trim();
  const sampleRate = Number(audio[3]);
  const channelDescription = audio[4].trim();
  if (!Number.isInteger(globalStreamIndex) || !codec || !Number.isFinite(sampleRate) || sampleRate <= 0) return undefined;
  const channelCount = channelDescription.match(/\b(mono|stereo|\d+(?:\.\d+)?(?:\+\w+)?)\b/i)?.[1];
  const channels = channelCount?.toLowerCase() === "mono" ? 1 : channelCount?.toLowerCase() === "stereo" ? 2 : Number(channelCount);
  const stream: AudioStream = {
    id: `ffmpeg-stream-${globalStreamIndex}`,
    label: `Audio stream ${globalStreamIndex + 1}`,
    ffmpegAudioOrdinal: audioOrdinal,
    present: true,
    summary: `${codec}, ${sampleRate.toLocaleString("en-US")} Hz, ${channelDescription}`,
    sampleRate,
    ...(Number.isInteger(channels) && channels > 0 ? { channels } : {}),
    ...(channelCount && !/^\d/.test(channelCount) ? { channelLayout: channelCount.toLowerCase() } : {}),
  };
  return { durationSeconds, inputFormats, audioStream: stream, audioOrdinal };
}

export function parseDecodableAudioStreams(log: string, format: MediaFormat, decodableOrdinals: ReadonlySet<number>): ParsedMediaProbe[] {
  return Array.from({ length: getAudioStreamCount(log) }, (_, audioOrdinal) =>
    decodableOrdinals.has(audioOrdinal) ? parseFfmpegProbeLog(log, format, audioOrdinal) : undefined,
  ).filter((probe): probe is ParsedMediaProbe => probe !== undefined);
}

export function audioStreamWasReported(log: string): boolean {
  return /Stream #0:\d+[^\r\n]*:\s*Audio:/i.test(log);
}

export function containerWasRecognized(log: string, format: MediaFormat): boolean {
  const parsed = parseFfmpegProbeLog(log, format);
  if (parsed) return true;
  const input = log.match(/Input #0,\s*([^\r\n]+?),\s*from\s*['"]/i)?.[1];
  if (!input) return false;
  const inputFormats = input.split(",").map((name) => name.trim().toLowerCase());
  return allowedInputFormats[format].some((name) => inputFormats.includes(name));
}

export function getAudioStreamCount(log: string): number {
  return [...log.matchAll(/Stream #0:\d+[^\r\n]*:\s*Audio:/gi)].length;
}
