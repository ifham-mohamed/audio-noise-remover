import { z } from "zod";

export const effectIds = ["noise-removal", "voice-clarity", "loudness-normalization", "echo-reverb-reduction"] as const;
export const effectIdSchema = z.enum(effectIds);
export const capabilityStateSchema = z.object({ status: z.enum(["ready", "limited", "unavailable"]), message: z.string().optional(), cpuSafe: z.boolean() });

const intensityParameters = z.object({ intensity: z.number().min(0).max(100) });
export const processingStageSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("noise-removal"), enabled: z.boolean(), parameters: intensityParameters }),
  z.object({ id: z.literal("voice-clarity"), enabled: z.boolean(), parameters: intensityParameters }),
  z.object({ id: z.literal("loudness-normalization"), enabled: z.boolean(), parameters: z.object({ targetLufs: z.number().min(-24).max(-9) }) }),
  z.object({ id: z.literal("echo-reverb-reduction"), enabled: z.boolean(), parameters: intensityParameters }),
]);
export const processingProfileSchema = z.object({ mediaRef: z.string().min(1), selectedAudioStreamId: z.string().min(1).optional(), stages: z.array(processingStageSchema) });
export type EffectId = z.infer<typeof effectIdSchema>;
export type CapabilityState = z.infer<typeof capabilityStateSchema>;
export type ProcessingStage = z.infer<typeof processingStageSchema>;
export type ProcessingProfile = z.infer<typeof processingProfileSchema>;

export const defaultProcessingStages: ProcessingStage[] = [
  { id: "noise-removal", enabled: true, parameters: { intensity: 60 } },
  { id: "voice-clarity", enabled: true, parameters: { intensity: 50 } },
  { id: "loudness-normalization", enabled: false, parameters: { targetLufs: -16 } },
  { id: "echo-reverb-reduction", enabled: false, parameters: { intensity: 40 } },
];

export function defaultProcessingProfile(mediaRef: string, selectedAudioStreamId?: string): ProcessingProfile { return processingProfileSchema.parse({ mediaRef, selectedAudioStreamId, stages: defaultProcessingStages }); }

export function normalizeProcessingProfile(value: unknown): ProcessingProfile {
  const parsed = processingProfileSchema.safeParse(value);
  if (!parsed.success) {
    const fallback = typeof value === "object" && value !== null && "mediaRef" in value && typeof value.mediaRef === "string" ? value.mediaRef : "local:unknown";
    return defaultProcessingProfile(fallback);
  }
  const byId = new Map(parsed.data.stages.map((stage) => [stage.id, stage]));
  return processingProfileSchema.parse({ ...parsed.data, stages: defaultProcessingStages.map((fallback) => byId.get(fallback.id) ?? fallback) });
}
