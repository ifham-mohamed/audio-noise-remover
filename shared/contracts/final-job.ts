import { z } from "zod";
import { audioStreamSchema, mediaMetadataSchema } from "@/shared/contracts/media";
import type { MediaMetadata } from "@/shared/contracts/media";
import { normalizeProcessingProfile, processingProfileSchema, type ProcessingProfile } from "@/shared/contracts/processing";
import { assertProcessingProfileAvailable, getProcessingProfileDeclaration, getStageDeclaration } from "@/shared/contracts/processing-profiles";

const finalMediaMetadataSchema = z.strictObject({ ...mediaMetadataSchema.shape, audioStream: audioStreamSchema.strict(), audioStreams: z.array(audioStreamSchema.strict()).min(1).optional() });
export const finalJobStateSchema = z.enum(["queued", "running", "cancelling", "cancelled", "succeeded", "failed"]);
export const finalJobIdSchema = z.string().uuid().brand<"FinalJobId">();
export const finalJobFailureSchema = z.strictObject({
  code: z.enum(["UNSUPPORTED_MEDIA", "MODEL_UNAVAILABLE", "RUNTIME_UNAVAILABLE", "RESOURCE_EXHAUSTED", "DISK_SPACE_LOW", "PROCESSING_FAILED"]),
  message: z.string().min(1),
  action: z.enum(["settings", "diagnostics", "effects"]).optional(),
});
export const finalJobStageSchema = z.strictObject({ id: z.string().min(1), label: z.string().min(1) });
export const finalJobExecutionSnapshotSchema = z.strictObject({ version: z.literal(1), modelId: z.string().min(1), modelVersion: z.string().min(1), runtime: z.literal("onnxruntime-web/wasm"), qualification: z.literal("experimental; not production-qualified") });
export const finalJobOutputSchema = z.strictObject({ artifactId: z.string().uuid(), fileName: z.string().min(1), mimeType: z.literal("audio/wav"), sizeBytes: z.number().int().positive(), durationSeconds: z.number().finite().positive(), mediaValidated: z.literal(true), experimental: z.literal(true) });
export const finalJobOutputAvailabilitySchema = z.enum(["available", "removing", "removed"]);
export const finalJobSchema = z.strictObject({
  id: finalJobIdSchema,
  retryOf: finalJobIdSchema.optional(),
  requestId: z.string().uuid().optional(),
  executionSnapshot: finalJobExecutionSnapshotSchema.optional(),
  kind: z.literal("final"),
  state: finalJobStateSchema,
  sequence: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  media: finalMediaMetadataSchema,
  profile: processingProfileSchema,
  enabledStages: z.array(finalJobStageSchema),
  phase: z.string().min(1).max(80).optional(),
  progress: z.number().min(0).max(1).optional(),
  elapsedMs: z.number().int().nonnegative(),
  failure: finalJobFailureSchema.optional(),
  output: finalJobOutputSchema.optional(),
  outputAvailability: finalJobOutputAvailabilitySchema.optional(),
  recoveryNotice: z.string().min(1).max(240).optional(),
}).superRefine((job, context) => {
  if (job.profile.mediaRef !== job.media.sourceRef) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "mediaRef"], message: "The profile must reference the selected source." });
  if (job.profile.output.mediaKind !== job.media.mediaKind) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "output", "mediaKind"], message: "The output type must match the selected source." });
  if (job.profile.output.destination.targetRef === job.media.sourceRef || job.profile.output.destination.targetRef === "source") context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "output", "destination", "targetRef"], message: "The original source cannot be an output target." });
  const declaration = getProcessingProfileDeclaration(job.profile.profileId);
  const stageOrder = job.profile.stages.map((stage) => declaration?.stages.findIndex((entry) => entry.id === stage.id) ?? -1);
  if (stageOrder.some((value, index) => value < 0 || (index > 0 && value <= stageOrder[index - 1]!))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "stages"], message: "Job profile stages must follow their declared order." });
  if (job.state === "failed" && !job.failure) context.addIssue({ code: z.ZodIssueCode.custom, path: ["failure"], message: "A failed final job requires a safe error." });
  if (job.state !== "failed" && job.failure) context.addIssue({ code: z.ZodIssueCode.custom, path: ["failure"], message: "Only failed jobs can carry a failure." });
  if (job.state === "succeeded" && !job.output && job.outputAvailability !== "removed") context.addIssue({ code: z.ZodIssueCode.custom, path: ["output"], message: "A successful final job requires a validated output artifact or a removed-output marker." });
  if (job.state !== "succeeded" && job.output) context.addIssue({ code: z.ZodIssueCode.custom, path: ["output"], message: "Only a successful final job can expose its output artifact." });
  const enabled = job.profile.stages.filter((stage) => stage.enabled).map((stage) => stage.id);
  if (enabled.length !== job.enabledStages.length || enabled.some((id, index) => id !== job.enabledStages[index]?.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["enabledStages"], message: "Active stages must exactly match the enabled profile stages in order." });
});
export const createFinalJobRequestSchema = z.strictObject({ media: finalMediaMetadataSchema, profile: processingProfileSchema.strict(), clientAttemptId: finalJobIdSchema.optional(), retryOfJobId: finalJobIdSchema.optional() });
export const finalJobEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("progress"), jobId: finalJobIdSchema, sequence: z.number().int().positive(), phase: z.string().min(1).max(80), stageId: z.string().min(1), progress: z.number().min(0).max(1).optional(), elapsedMs: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("failed"), jobId: finalJobIdSchema, sequence: z.number().int().positive(), elapsedMs: z.number().int().nonnegative(), failure: finalJobFailureSchema }),
  z.strictObject({ type: z.literal("cancelled"), jobId: finalJobIdSchema, sequence: z.number().int().positive(), elapsedMs: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("succeeded"), jobId: finalJobIdSchema, sequence: z.number().int().positive(), elapsedMs: z.number().int().nonnegative(), output: finalJobOutputSchema }),
]);
export const finalJobCommandSchema = z.discriminatedUnion("command", [z.strictObject({ command: z.literal("event"), event: finalJobEventSchema }), z.strictObject({ command: z.literal("cancel") })]);
export const finalJobEnvelopeSchema = z.object({ data: finalJobSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable(), requestId: z.string() });
export const finalJobListEnvelopeSchema = z.object({ data: z.array(finalJobSchema).nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable(), requestId: z.string() });

export type FinalJob = z.infer<typeof finalJobSchema>;
export type FinalJobEvent = z.infer<typeof finalJobEventSchema>;
export type FinalJobOutput = z.infer<typeof finalJobOutputSchema>;
export const cleanupScopeSchema = z.enum(["REMOVE_PREVIEWS", "REMOVE_OUTPUTS", "CLEAR_HISTORY", "REMOVE_ALL"]);
export const cleanupRequestSchema = z.strictObject({ scope: cleanupScopeSchema, phase: z.enum(["prepare", "finish", "abort"]).default("finish"), token: z.string().uuid().optional(), plannedPreviewIds: z.array(z.string().uuid()).default([]), plannedOutputIds: z.array(z.string().uuid()).default([]), plannedSourceRefs: z.array(z.string().min(1)).default([]), plannedFinalHistoryIds: z.array(z.string().uuid()).default([]), plannedPreviewHistoryIds: z.array(z.string().uuid()).default([]), removedPreviewIds: z.array(z.string().uuid()).default([]), removedOutputIds: z.array(z.string().uuid()).default([]), removedSourceRefs: z.array(z.string().min(1)).default([]), failedArtifacts: z.array(z.strictObject({ id: z.string().min(1), kind: z.enum(["preview", "output", "retry-source"]) })).default([]) });
export const cleanupItemSchema = z.strictObject({ id: z.string().min(1), kind: z.enum(["preview", "output", "retry-source", "history", "active-skip"]), outcome: z.enum(["removed", "retained", "failed", "skipped"]), message: z.string().min(1) });
export const cleanupResultSchema = z.strictObject({ scope: cleanupScopeSchema, items: z.array(cleanupItemSchema), complete: z.boolean() });
export const cleanupRequestEnvelopeSchema = z.strictObject({ data: cleanupRequestSchema, error: z.null(), requestId: z.string().uuid() });
export const cleanupResultEnvelopeSchema = z.strictObject({ data: cleanupResultSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable(), requestId: z.string().uuid() });
export type FinalJobId = z.infer<typeof finalJobIdSchema>;

export const experimentalFinalLimits = { maxInputBytes: 128 * 1024 * 1024, maxDurationSeconds: 300 } as const;

export function isSupportedExperimentalFinalProfile(media: MediaMetadata, profile: ProcessingProfile) {
  const enabled = profile.stages.filter((stage) => stage.enabled);
  const outputName = profile.output.destination.targetName.trim();
  return profile.profileId === "speech"
    && media.mediaKind === "audio"
    && media.format === "wav"
    && media.sizeBytes > 0 && media.sizeBytes <= experimentalFinalLimits.maxInputBytes
    && media.durationSeconds > 0 && media.durationSeconds <= experimentalFinalLimits.maxDurationSeconds
    && (media.audioStream.channels ?? 1) <= 2
    && enabled.length >= 1 && enabled.length <= 2
    && enabled.every((stage) => ["noise-removal", "voice-clarity"].includes(stage.id))
    && enabled.every((stage) => stage.id === "voice-clarity" ? stage.parameters.intensity >= 0 : stage.parameters.intensity > 0)
    && enabled.some((stage) => stage.parameters.intensity > 0)
    && profile.output.mediaKind === "audio" && profile.output.format === "audio-wav" && profile.output.audioCodec === "pcm_s24le"
    && !profile.output.destination.targetRef.startsWith("source")
    && outputName.toLowerCase() !== media.sourceName.trim().toLowerCase()
    && outputName.length <= 180 && outputName === profile.output.destination.targetName.trim()
    && !/[\\/<>:"|?*\u0000-\u001f]/.test(outputName)
    && !/[. ]$/.test(outputName)
    && outputName.toLowerCase().endsWith(".wav")
    && ["ask", "browser-download"].includes(profile.output.destination.mode);
}

export type FinalJobErrorCode = "INVALID_MEDIA" | "INVALID_PROFILE" | "SOURCE_TARGET" | "MODEL_UNAVAILABLE" | "RUNTIME_UNAVAILABLE" | "STORAGE_UNAVAILABLE" | "DISK_SPACE_LOW" | "JOB_NOT_FOUND" | "INVALID_TRANSITION";
export class FinalJobError extends Error {
  constructor(readonly code: FinalJobErrorCode, message: string) { super(message); this.name = "FinalJobError"; }
}

export function createFinalJob(mediaInput: unknown, profileInput: unknown, options: { id?: string; retryOf?: string; createdAt?: string; requestId?: string; executionSnapshot?: z.infer<typeof finalJobExecutionSnapshotSchema> } = {}): FinalJob {
  if (typeof profileInput === "object" && profileInput !== null && "output" in profileInput && typeof profileInput.output === "object" && profileInput.output !== null && "destination" in profileInput.output && typeof profileInput.output.destination === "object" && profileInput.output.destination !== null && "targetRef" in profileInput.output.destination && profileInput.output.destination.targetRef === "source") throw new FinalJobError("SOURCE_TARGET", "Choose a different output target to keep the original unchanged.");
  const request = createFinalJobRequestSchema.safeParse({ media: mediaInput, profile: profileInput });
  if (!request.success) throw new FinalJobError("INVALID_PROFILE", "Review the selected media and output settings, then try again.");
  const { media } = request.data;
  const profile = normalizeProcessingProfile(request.data.profile);
  const profileDeclaration = getProcessingProfileDeclaration(profile.profileId);
  if (!profileDeclaration) throw new FinalJobError("INVALID_PROFILE", "The selected enhancement profile is not registered.");
  try { assertProcessingProfileAvailable(profile.profileId); }
  catch (cause) { throw new FinalJobError("MODEL_UNAVAILABLE", cause instanceof Error ? cause.message : "This profile is unavailable for local processing."); }
  if (!profileDeclaration.mediaKinds.includes(media.mediaKind)) throw new FinalJobError("INVALID_PROFILE", `The ${profileDeclaration.label} profile does not support ${media.mediaKind} media.`);
  if (!profile.stages.some((stage) => stage.enabled)) throw new FinalJobError("INVALID_PROFILE", "Enable at least one enhancement stage before starting final processing.");
  const selected = media.selectedAudioStreamId ?? media.audioStream.id;
  const stream = media.audioStreams?.find((item) => item.id === selected) ?? media.audioStream;
  if (!stream.present || profile.mediaRef !== media.sourceRef || profile.selectedAudioStreamId !== selected || profile.output.mediaKind !== media.mediaKind) throw new FinalJobError("INVALID_MEDIA", "The selected media or audio stream is no longer valid.");
  if (profile.output.destination.targetRef === "source") throw new FinalJobError("SOURCE_TARGET", "Choose a different output target to keep the original unchanged.");
  const now = options.createdAt ?? new Date().toISOString();
  return finalJobSchema.parse({ id: options.id ?? crypto.randomUUID(), retryOf: options.retryOf, requestId: options.requestId, executionSnapshot: options.executionSnapshot, kind: "final", state: "queued", sequence: 0, createdAt: now, updatedAt: now, media, profile, enabledStages: profile.stages.filter((stage) => stage.enabled).map((stage) => ({ id: stage.id, label: getStageDeclaration(profile.profileId, stage.id)?.label ?? stage.id.replaceAll("-", " ") })), elapsedMs: 0 });
}

/** Formats only stable identifiers, states, timings, validated profile parameters, and configured runtime identity. */
export function formatFinalJobDiagnostic(job: FinalJob): string {
  const lines = [`Job ID: ${job.id}`, ...(job.requestId ? [`Request ID: ${job.requestId}`] : []), `State: ${job.state}`, `Created: ${job.createdAt}`, `Updated: ${job.updatedAt}`, `Elapsed: ${job.elapsedMs} ms`];
  if (job.retryOf) lines.push(`Retry of job: ${job.retryOf}`);
  lines.push(`Enabled stages: ${job.profile.stages.filter((stage) => stage.enabled).map((stage) => `${stage.id} (${Object.entries(stage.parameters).map(([key, value]) => `${key}=${value}`).join(", ")})`).join("; ") || "None"}`);
  if (job.failure) lines.push(`Failure code: ${job.failure.code}`);
  else if (job.state === "cancelled") lines.push("Terminal reason: CANCELLED");
  else if (job.state === "succeeded") lines.push("Terminal reason: COMPLETED");
  else if (job.recoveryNotice) lines.push("Terminal reason: RECOVERED_AFTER_RESTART");
  if (job.executionSnapshot) lines.push(`Configured model: ${job.executionSnapshot.modelId} ${job.executionSnapshot.modelVersion}`, `Configured runtime: ${job.executionSnapshot.runtime}`, `Qualification: ${job.executionSnapshot.qualification}`);
  return lines.join("\n");
}
