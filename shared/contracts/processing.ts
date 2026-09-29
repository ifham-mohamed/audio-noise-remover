import { z } from "zod";

export const effectIds = ["noise-removal", "voice-clarity", "loudness-normalization", "echo-reverb-reduction"] as const;
export const effectIdSchema = z.enum(effectIds);
export const capabilityStateSchema = z.object({ status: z.enum(["ready", "limited", "unavailable"]), message: z.string().optional(), cpuSafe: z.boolean() });

export const outputFormatSchema = z.enum(["audio-wav", "audio-flac", "audio-mp3", "audio-m4a", "source-video", "mp4"]);
export const outputDestinationSchema = z.object({ mode: z.enum(["file-system", "browser-download", "ask"]), targetName: z.string().min(1), targetRef: z.string().min(1), exists: z.boolean(), overwriteConfirmed: z.boolean() });
export const outputProfileSchema = z.object({ mediaKind: z.enum(["audio", "video"]), format: outputFormatSchema, quality: z.enum(["standard", "high"]), sampleRate: z.literal(48000), audioCodec: z.enum(["pcm_s24le", "flac", "mp3", "aac"]), audioBitrateKbps: z.number().int().positive().optional(), videoCodec: z.enum(["source", "h264"]).optional(), destination: outputDestinationSchema }).superRefine((profile, context) => {
  if (profile.mediaKind === "audio" && profile.format === "source-video") context.addIssue({ code: z.ZodIssueCode.custom, path: ["format"], message: "Video output is not available for audio-only media." });
  if (profile.mediaKind === "video" && profile.format.startsWith("audio-")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["format"], message: "Audio-only output is not available for video media in this profile." });
  if (profile.mediaKind === "video" && (!profile.videoCodec || profile.audioCodec !== "aac" || profile.audioBitrateKbps !== 192)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["audioBitrateKbps"], message: "Video output requires AAC at 192 kbps." });
  if (profile.destination.targetRef === "source") context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination", "targetRef"], message: "The original source cannot be an output target." });
  if (profile.destination.exists && !profile.destination.overwriteConfirmed) context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination", "overwriteConfirmed"], message: "Confirm overwrite or choose another destination." });
});

const intensityParameters = z.object({ intensity: z.number().min(0).max(100) });
export const processingStageSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("noise-removal"), enabled: z.boolean(), parameters: intensityParameters }),
  z.object({ id: z.literal("voice-clarity"), enabled: z.boolean(), parameters: intensityParameters }),
  z.object({ id: z.literal("loudness-normalization"), enabled: z.boolean(), parameters: z.object({ targetLufs: z.number().min(-24).max(-9) }) }),
  z.object({ id: z.literal("echo-reverb-reduction"), enabled: z.boolean(), parameters: intensityParameters }),
]);
export const processingProfileSchema = z.object({ mediaRef: z.string().min(1), selectedAudioStreamId: z.string().min(1).optional(), stages: z.array(processingStageSchema), output: outputProfileSchema });
export type EffectId = z.infer<typeof effectIdSchema>;
export type CapabilityState = z.infer<typeof capabilityStateSchema>;
export type ProcessingStage = z.infer<typeof processingStageSchema>;
export type OutputProfile = z.infer<typeof outputProfileSchema>;
export type ProcessingProfile = z.infer<typeof processingProfileSchema>;

export const defaultProcessingStages: ProcessingStage[] = [
  { id: "noise-removal", enabled: true, parameters: { intensity: 60 } },
  { id: "voice-clarity", enabled: true, parameters: { intensity: 50 } },
  { id: "loudness-normalization", enabled: false, parameters: { targetLufs: -16 } },
  { id: "echo-reverb-reduction", enabled: false, parameters: { intensity: 40 } },
];

export function defaultOutputProfile(mediaRef: string, mediaKind: "audio" | "video" = "audio", sourceFormat?: string, targetName = "enhanced-output.wav"): OutputProfile {
  const videoSource = mediaKind === "video" && sourceFormat !== "mp4";
  return outputProfileSchema.parse({ mediaKind, format: mediaKind === "audio" ? "audio-wav" : videoSource ? "source-video" : "mp4", quality: "high", sampleRate: 48000, audioCodec: mediaKind === "audio" ? "pcm_s24le" : "aac", audioBitrateKbps: mediaKind === "video" ? 192 : undefined, videoCodec: mediaKind === "video" ? (videoSource ? "source" : "h264") : undefined, destination: { mode: "ask", targetName, targetRef: `destination:${targetName}`, exists: false, overwriteConfirmed: false } });
}
export function defaultProcessingProfile(mediaRef: string, selectedAudioStreamId?: string, mediaKind: "audio" | "video" = "audio", sourceFormat?: string, targetName?: string): ProcessingProfile { return processingProfileSchema.parse({ mediaRef, selectedAudioStreamId, stages: defaultProcessingStages, output: defaultOutputProfile(mediaRef, mediaKind, sourceFormat, targetName ?? (mediaKind === "video" ? "enhanced-output.mp4" : "enhanced-output.wav")) }); }

export function normalizeProcessingProfile(value: unknown): ProcessingProfile {
  const parsed = processingProfileSchema.safeParse(value);
  if (!parsed.success) {
    const fallback = typeof value === "object" && value !== null && "mediaRef" in value && typeof value.mediaRef === "string" ? value.mediaRef : "local:unknown";
    const mediaKind = typeof value === "object" && value !== null && "output" in value && typeof value.output === "object" && value.output !== null && "mediaKind" in value.output && value.output.mediaKind === "video" ? "video" : "audio";
    return defaultProcessingProfile(fallback, undefined, mediaKind);
  }
  const byId = new Map(parsed.data.stages.map((stage) => [stage.id, stage]));
  return processingProfileSchema.parse({ ...parsed.data, stages: defaultProcessingStages.map((fallback) => byId.get(fallback.id) ?? fallback) });
}
