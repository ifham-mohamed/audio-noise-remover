import { z } from "zod";
import { audioStreamSchema, mediaMetadataSchema } from "@/shared/contracts/media";
import { processingProfileSchema } from "@/shared/contracts/processing";

const finalMediaMetadataSchema = z.strictObject({ ...mediaMetadataSchema.shape, audioStream: audioStreamSchema.strict(), audioStreams: z.array(audioStreamSchema.strict()).min(1).optional() });
export const finalJobStateSchema = z.enum(["queued", "running", "cancelling", "cancelled", "succeeded", "failed"]);
export const finalJobIdSchema = z.string().uuid().brand<"FinalJobId">();
export const finalJobFailureSchema = z.strictObject({
  code: z.enum(["UNSUPPORTED_MEDIA", "MODEL_UNAVAILABLE", "RUNTIME_UNAVAILABLE", "RESOURCE_EXHAUSTED", "DISK_SPACE_LOW", "PROCESSING_FAILED"]),
  message: z.string().min(1),
  action: z.enum(["settings", "diagnostics", "effects"]).optional(),
});
export const finalJobStageSchema = z.strictObject({ id: z.string().min(1), label: z.string().min(1) });
export const finalJobOutputSchema = z.strictObject({ fileName: z.string().min(1), mimeType: z.string().min(1), sizeBytes: z.number().int().positive(), durationSeconds: z.number().finite().positive(), mediaValidated: z.literal(true) });
export const finalJobSchema = z.strictObject({
  id: finalJobIdSchema,
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
}).superRefine((job, context) => {
  if (job.profile.mediaRef !== job.media.sourceRef) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "mediaRef"], message: "The profile must reference the selected source." });
  if (job.profile.output.mediaKind !== job.media.mediaKind) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "output", "mediaKind"], message: "The output type must match the selected source." });
  if (job.profile.output.destination.targetRef === job.media.sourceRef || job.profile.output.destination.targetRef === "source") context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "output", "destination", "targetRef"], message: "The original source cannot be an output target." });
  if (job.state === "failed" && !job.failure) context.addIssue({ code: z.ZodIssueCode.custom, path: ["failure"], message: "A failed final job requires a safe error." });
  if (job.state !== "failed" && job.failure) context.addIssue({ code: z.ZodIssueCode.custom, path: ["failure"], message: "Only failed jobs can carry a failure." });
  if (job.state === "succeeded" && !job.output) context.addIssue({ code: z.ZodIssueCode.custom, path: ["output"], message: "A successful final job requires a validated output artifact." });
  if (job.state !== "succeeded" && job.output) context.addIssue({ code: z.ZodIssueCode.custom, path: ["output"], message: "Only a successful final job can expose its output artifact." });
  const enabled = job.profile.stages.filter((stage) => stage.enabled).map((stage) => stage.id);
  if (enabled.length !== job.enabledStages.length || enabled.some((id, index) => id !== job.enabledStages[index]?.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["enabledStages"], message: "Active stages must exactly match the enabled profile stages in order." });
});
export const createFinalJobRequestSchema = z.strictObject({ media: finalMediaMetadataSchema, profile: processingProfileSchema.strict() });
export const finalJobEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("progress"), jobId: finalJobIdSchema, sequence: z.number().int().positive(), phase: z.string().min(1).max(80), stageId: z.string().min(1), progress: z.number().min(0).max(1).optional(), elapsedMs: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("failed"), jobId: finalJobIdSchema, sequence: z.number().int().positive(), elapsedMs: z.number().int().nonnegative(), failure: finalJobFailureSchema }),
]);
export const finalJobCommandSchema = z.strictObject({ command: z.literal("event"), event: finalJobEventSchema });
export const finalJobEnvelopeSchema = z.object({ data: finalJobSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable(), requestId: z.string() });
export const finalJobListEnvelopeSchema = z.object({ data: z.array(finalJobSchema).nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable(), requestId: z.string() });

export type FinalJob = z.infer<typeof finalJobSchema>;
export type FinalJobEvent = z.infer<typeof finalJobEventSchema>;
export type FinalJobId = z.infer<typeof finalJobIdSchema>;

export type FinalJobErrorCode = "INVALID_MEDIA" | "INVALID_PROFILE" | "SOURCE_TARGET" | "MODEL_UNAVAILABLE" | "RUNTIME_UNAVAILABLE" | "STORAGE_UNAVAILABLE" | "DISK_SPACE_LOW" | "JOB_NOT_FOUND" | "INVALID_TRANSITION";
export class FinalJobError extends Error {
  constructor(readonly code: FinalJobErrorCode, message: string) { super(message); this.name = "FinalJobError"; }
}

export function createFinalJob(mediaInput: unknown, profileInput: unknown, options: { id?: string; createdAt?: string } = {}): FinalJob {
  if (typeof profileInput === "object" && profileInput !== null && "output" in profileInput && typeof profileInput.output === "object" && profileInput.output !== null && "destination" in profileInput.output && typeof profileInput.output.destination === "object" && profileInput.output.destination !== null && "targetRef" in profileInput.output.destination && profileInput.output.destination.targetRef === "source") throw new FinalJobError("SOURCE_TARGET", "Choose a different output target to keep the original unchanged.");
  const request = createFinalJobRequestSchema.safeParse({ media: mediaInput, profile: profileInput });
  if (!request.success) throw new FinalJobError("INVALID_PROFILE", "Review the selected media and output settings, then try again.");
  const { media, profile } = request.data;
  if (!profile.stages.some((stage) => stage.enabled)) throw new FinalJobError("INVALID_PROFILE", "Enable at least one enhancement stage before starting final processing.");
  const selected = media.selectedAudioStreamId ?? media.audioStream.id;
  const stream = media.audioStreams?.find((item) => item.id === selected) ?? media.audioStream;
  if (!stream.present || profile.mediaRef !== media.sourceRef || profile.selectedAudioStreamId !== selected || profile.output.mediaKind !== media.mediaKind) throw new FinalJobError("INVALID_MEDIA", "The selected media or audio stream is no longer valid.");
  if (profile.output.destination.targetRef === "source") throw new FinalJobError("SOURCE_TARGET", "Choose a different output target to keep the original unchanged.");
  const now = options.createdAt ?? new Date().toISOString();
  return finalJobSchema.parse({ id: options.id ?? crypto.randomUUID(), kind: "final", state: "queued", sequence: 0, createdAt: now, updatedAt: now, media, profile, enabledStages: profile.stages.filter((stage) => stage.enabled).map((stage) => ({ id: stage.id, label: stage.id.replaceAll("-", " ") })), elapsedMs: 0 });
}
