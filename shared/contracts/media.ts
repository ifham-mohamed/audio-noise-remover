import { z } from "zod";

export const supportedMediaFormats = ["mp3", "wav", "m4a", "flac", "mp4", "mov", "mkv"] as const;
export const mediaFormatSchema = z.enum(supportedMediaFormats);
export const mediaKindSchema = z.enum(["audio", "video"]);
export const mediaErrorCodeSchema = z.enum(["UNSUPPORTED_MEDIA", "CORRUPT_MEDIA", "NO_AUDIO_STREAM", "INSPECTION_UNAVAILABLE"]);

export const audioStreamSchema = z.object({ id: z.string().min(1).optional(), label: z.string().min(1).optional(), present: z.boolean(), summary: z.string(), channels: z.number().int().positive().optional(), channelLayout: z.string().min(1).optional(), sampleRate: z.number().positive().optional() });
export const mediaMetadataSchema = z.object({ sourceName: z.string().min(1), sourceRef: z.string().min(1), format: mediaFormatSchema, mediaKind: mediaKindSchema, sizeBytes: z.number().int().nonnegative(), durationSeconds: z.number().nonnegative(), audioStream: audioStreamSchema, audioStreams: z.array(audioStreamSchema).min(1).optional(), selectedAudioStreamId: z.string().min(1).optional() }).superRefine((metadata, context) => { if (metadata.selectedAudioStreamId && metadata.audioStreams && !metadata.audioStreams.some((stream) => stream.id === metadata.selectedAudioStreamId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedAudioStreamId"], message: "Selected audio stream is not available." }); });
export const mediaInspectionSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("ready"), metadata: mediaMetadataSchema }), z.object({ status: z.literal("error"), code: mediaErrorCodeSchema, message: z.string(), supportedFormats: z.array(mediaFormatSchema).optional() })]);
export type MediaFormat = z.infer<typeof mediaFormatSchema>;
export type AudioStream = z.infer<typeof audioStreamSchema>;
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
export type MediaInspection = z.infer<typeof mediaInspectionSchema>;

export function formatFromFileName(name: string): MediaFormat | undefined { const extension = name.toLowerCase().split(".").pop(); return extension && supportedMediaFormats.includes(extension as MediaFormat) ? extension as MediaFormat : undefined; }
export function kindFromFormat(format: MediaFormat): "audio" | "video" { return ["mp4", "mov", "mkv"].includes(format) ? "video" : "audio"; }
