import { z } from "zod";
import { processingProfileIdSchema } from "@/shared/contracts/processing-profile-ids";

export const profileMediaKindSchema = z.enum(["audio", "video"]);
export const profileParameterSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  type: z.literal("number"),
  minimum: z.number().finite(),
  maximum: z.number().finite(),
  defaultValue: z.number().finite(),
  step: z.number().positive().finite(),
  unit: z.string().min(1),
}).superRefine((parameter, context) => {
  if (parameter.minimum > parameter.maximum || parameter.defaultValue < parameter.minimum || parameter.defaultValue > parameter.maximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultValue"], message: "The parameter default must be within its declared range." });
  }
});
export const profileStageDeclarationSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  parameters: z.array(profileParameterSchema),
  requiredCapabilities: z.array(z.string().min(1)),
  adapterId: z.string().min(1),
  metrics: z.array(z.string().min(1)).min(1),
}).superRefine((stage, context) => {
  if (!stage.requiredCapabilities.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredCapabilities"], message: "A stage must declare at least one required capability." });
  const parameterIds = stage.parameters.map((parameter) => parameter.id);
  if (new Set(parameterIds).size !== parameterIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["parameters"], message: "Parameter IDs must be unique within a stage." });
});
export const processingProfileDeclarationSchema = z.strictObject({
  id: processingProfileIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  mediaKinds: z.array(profileMediaKindSchema).min(1),
  execution: z.strictObject({ status: z.enum(["available", "unavailable"]), qualification: z.enum(["experimental", "qualified", "unqualified"]), reason: z.string().min(1).optional() }),
  stages: z.array(profileStageDeclarationSchema).min(1),
}).superRefine((profile, context) => {
  if (profile.execution.status === "unavailable" && !profile.execution.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["execution", "reason"], message: "Unavailable profiles require an actionable explanation." });
  }
  if (profile.execution.status === "available" && profile.execution.qualification === "unqualified") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["execution", "qualification"], message: "An unqualified profile cannot be marked available." });
  }
  const ids = profile.stages.map((stage) => stage.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "Stage IDs must be unique and ordered." });
});

const intensity = (label: string, description: string, defaultValue: number, unit: string) => ({ id: "intensity", label, description, type: "number" as const, minimum: 0, maximum: 100, defaultValue, step: 5, unit });
const speechStageCopy = {
  "noise-removal": { label: "Noise removal", description: "Reduce steady background noise while protecting speech detail.", adapterId: "speech.dpdfnet.experimental", metrics: ["noise-reduction", "speech-quality"], unit: "% intensity" },
  "voice-clarity": { label: "Voice clarity", description: "A subtle presence EQ applied after noise removal when both are enabled, centered at 3 kHz; intensity maps from 0–100 to 0–4 dB.", adapterId: "speech.voice-clarity.presence-eq-v1", metrics: ["speech-clarity", "peak-level"], unit: "% intensity" },
  "loudness-normalization": { label: "Loudness normalization", description: "Bring overall speech level toward a consistent listening target.", adapterId: "audio.loudness-normalization", metrics: ["integrated-loudness"], unit: "LUFS" },
  "echo-reverb-reduction": { label: "Echo/reverb reduction", description: "Soften room reflections that make speech sound distant or blurred.", adapterId: "speech.echo-reverb", metrics: ["reverberation-reduction"], unit: "% reduction" },
} as const;

const speechDefaults = [
  { id: "noise-removal", intensity: 60 },
  { id: "voice-clarity", intensity: 50 },
  { id: "loudness-normalization", targetLufs: -16 },
  { id: "echo-reverb-reduction", intensity: 40 },
] as const;
const speech = {
  id: "speech", label: "Speech", description: "Independent local enhancement stages for speech-focused audio and video.", mediaKinds: ["audio", "video"],
  execution: { status: "available", qualification: "experimental", reason: "The existing speech path is available under its current experimental limits." },
  stages: speechDefaults.map((stage) => {
    const copy = speechStageCopy[stage.id];
    const { unit: parameterUnit, ...stageCopy } = copy;
    return { id: stage.id, ...stageCopy, parameters: stage.id === "loudness-normalization" ? [{ id: "targetLufs", label: "Target loudness", description: "Integrated loudness target.", type: "number" as const, minimum: -24, maximum: -9, defaultValue: stage.targetLufs, step: 1, unit: "LUFS" }] : [intensity("Intensity", copy.description, stage.intensity, parameterUnit)], requiredCapabilities: [copy.adapterId], };
  }),
} as const;

const unavailableReason = "No qualified local adapter is available yet. This declaration is informational and cannot be selected for processing.";
const futureStage = (id: string, label: string, description: string, adapterId: string, metrics: string[]) => ({ id, label, description, parameters: [intensity("Amount", description, 50, "%")], requiredCapabilities: [adapterId], adapterId, metrics });
const music = {
  id: "music", label: "Music", description: "Future music enhancement profile; execution is not enabled.", mediaKinds: ["audio", "video"],
  execution: { status: "unavailable", qualification: "unqualified", reason: unavailableReason },
  stages: [futureStage("music-denoise", "Music denoising", "Reduce background noise while preserving musical detail.", "music.denoise", ["noise-reduction", "music-quality"]), futureStage("music-restoration", "Music restoration", "Restore musical detail using a qualified local model.", "music.restoration", ["restoration-quality"])],
} as const;
const mixedAudio = {
  id: "mixed-audio", label: "Mixed audio", description: "Future profile for recordings that combine speech and music; execution is not enabled.", mediaKinds: ["audio", "video"],
  execution: { status: "unavailable", qualification: "unqualified", reason: unavailableReason },
  stages: [futureStage("source-separation", "Speech and music separation", "Separate speech and music while preserving both sources.", "mixed.source-separation", ["separation-quality", "speech-quality", "music-quality"]), futureStage("mixed-audio-denoise", "Mixed-audio denoising", "Reduce noise while preserving speech and musical content.", "mixed.denoise", ["noise-reduction", "mixed-audio-quality"])],
} as const;

export const processingProfileRegistrySchema = z.array(processingProfileDeclarationSchema).superRefine((profiles, context) => {
  const ids = profiles.map((profile) => profile.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "Processing profile IDs must be unique in the registry." });
});
export const processingProfileRegistry = processingProfileRegistrySchema.parse([speech, music, mixedAudio]);
export type ProcessingProfileDeclaration = z.infer<typeof processingProfileDeclarationSchema>;
export function getProcessingProfileDeclaration(id: string) { return processingProfileRegistry.find((profile) => profile.id === id); }
export function assertProcessingProfileAvailable(id: string, mediaKind?: "audio" | "video"): ProcessingProfileDeclaration {
  const profile = getProcessingProfileDeclaration(id);
  if (!profile) throw new Error("The selected processing profile is not registered.");
  if (profile.execution.status !== "available" || profile.execution.qualification === "unqualified") throw new Error(profile.execution.reason ?? "This profile is unavailable for processing.");
  if (mediaKind && !profile.mediaKinds.includes(mediaKind)) throw new Error(`The ${profile.label} profile does not support ${mediaKind} media.`);
  return profile;
}
export function getStageDeclaration(profileId: string, stageId: string) { return getProcessingProfileDeclaration(profileId)?.stages.find((stage) => stage.id === stageId); }
