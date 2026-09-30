import { z } from "zod";
import { processingProfileIdSchema, processingProfileIds } from "@/shared/contracts/processing-profile-ids";
import { getProcessingProfileDeclaration } from "@/shared/contracts/processing-profiles";

export const effectIds = ["noise-removal", "voice-clarity", "loudness-normalization", "echo-reverb-reduction"] as const;
export const effectIdSchema = z.enum(effectIds);
export { processingProfileIdSchema, processingProfileIds };
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

export const processingStageSchema = z.strictObject({ id: z.string().min(1), enabled: z.boolean(), parameters: z.record(z.string(), z.number().finite()) });
export const processingProfileSchema = z.object({ profileId: processingProfileIdSchema.default("speech"), mediaRef: z.string().min(1), selectedAudioStreamId: z.string().min(1).optional(), stages: z.array(processingStageSchema), output: outputProfileSchema }).superRefine((profile, context) => {
  const declaration = getProcessingProfileDeclaration(profile.profileId);
  if (!declaration) { context.addIssue({ code: z.ZodIssueCode.custom, path: ["profileId"], message: "The processing profile is not registered." }); return; }
  if (!declaration.mediaKinds.includes(profile.output.mediaKind)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["output", "mediaKind"], message: `The ${declaration.label} profile does not support ${profile.output.mediaKind} media.` });
  for (const [index, stage] of profile.stages.entries()) {
    const stageDeclaration = declaration.stages.find((item) => item.id === stage.id);
    if (!stageDeclaration) { context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages", index, "id"], message: `Stage ${stage.id} is not declared by the ${declaration.label} profile.` }); continue; }
    const expected = new Map(stageDeclaration.parameters.map((parameter) => [parameter.id, parameter]));
    const keys = Object.keys(stage.parameters);
    if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages", index, "parameters"], message: `Stage ${stage.id} parameters do not match its declaration.` });
    for (const [key, value] of Object.entries(stage.parameters)) {
      const parameter = expected.get(key);
      if (parameter && (value < parameter.minimum || value > parameter.maximum)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages", index, "parameters", key], message: `${parameter.label} is outside its declared range.` });
    }
  }
  const stageIds = profile.stages.map((stage) => stage.id);
  if (new Set(stageIds).size !== stageIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "A profile cannot contain duplicate stages." });
});
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
export function defaultProcessingProfile(mediaRef: string, selectedAudioStreamId?: string, mediaKind: "audio" | "video" = "audio", sourceFormat?: string, targetName?: string): ProcessingProfile { return processingProfileSchema.parse({ profileId: "speech", mediaRef, selectedAudioStreamId, stages: defaultProcessingStages, output: defaultOutputProfile(mediaRef, mediaKind, sourceFormat, targetName ?? (mediaKind === "video" ? "enhanced-output.mp4" : "enhanced-output.wav")) }); }

export function normalizeProcessingProfile(value: unknown): ProcessingProfile {
  const parsed = processingProfileSchema.safeParse(value);
  if (!parsed.success) throw new Error("The processing profile is invalid or contains an undeclared stage.");
  const declaration = getProcessingProfileDeclaration(parsed.data.profileId);
  if (!declaration) throw new Error("The processing profile is not registered.");
  const byId = new Map(parsed.data.stages.map((stage) => [stage.id, stage]));
  return processingProfileSchema.parse({ ...parsed.data, stages: declaration.stages.map((stage) => byId.get(stage.id) ?? (parsed.data.profileId === "speech" ? defaultProcessingStages.find((fallback) => fallback.id === stage.id) : undefined) ?? { id: stage.id, enabled: false, parameters: Object.fromEntries(stage.parameters.map((parameter) => [parameter.id, parameter.defaultValue])) }) });
}
