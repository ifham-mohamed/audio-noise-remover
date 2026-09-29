import { z } from "zod";
import { normalizeProcessingProfile, processingProfileSchema, type ProcessingProfile } from "@/shared/contracts/processing";
import { mediaMetadataSchema } from "@/shared/contracts/media";

export const MAX_PREVIEW_DURATION_SECONDS = 30;
// FFmpeg.wasm requires the selected File to be resident in memory. Keep the
// browser preview boundary explicit instead of allowing oversized inputs to
// exhaust the tab while ArrayBuffer and FFmpeg copies coexist.
export const MAX_PREVIEW_INPUT_BYTES = 256 * 1024 * 1024;
export const previewRangeSchema = z.object({ startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive() }).superRefine((range, context) => {
  if (range.endSeconds <= range.startSeconds) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endSeconds"], message: "Preview end must be after its start." });
  if (range.endSeconds - range.startSeconds > MAX_PREVIEW_DURATION_SECONDS) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endSeconds"], message: `A preview cannot exceed ${MAX_PREVIEW_DURATION_SECONDS} seconds.` });
});
export const previewStateSchema = z.enum(["queued", "running", "cancelling", "cancelled", "succeeded", "failed"]);
export const previewArtifactSchema = z.object({ id: z.string().uuid(), mimeType: z.string().min(1), sizeBytes: z.number().int().positive(), durationSeconds: z.number().positive() });
export const previewFailureSchema = z.object({ code: z.enum(["UNSUPPORTED_MEDIA", "MODEL_UNAVAILABLE", "RUNTIME_UNAVAILABLE", "DISK_SPACE_LOW", "PROCESSING_FAILED", "CANCELLED"]), message: z.string().min(1), action: z.enum(["retry", "settings", "diagnostics"]).optional() });
export const previewJobSchema = z.object({
  id: z.string().uuid(), kind: z.literal("preview"), state: previewStateSchema, sequence: z.number().int().nonnegative(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  media: mediaMetadataSchema, profile: processingProfileSchema, range: previewRangeSchema, modelVersions: z.record(z.string(), z.string()).default({}), retryOf: z.string().uuid().optional(),
  phase: z.string().optional(), progress: z.number().min(0).max(1).optional(), elapsedMs: z.number().int().nonnegative().default(0), artifact: previewArtifactSchema.optional(), failure: previewFailureSchema.optional(),
}).superRefine((job, context) => {
  if (job.profile.mediaRef !== job.media.sourceRef) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "mediaRef"], message: "Preview profile must reference the selected source." });
  if (job.profile.output.mediaKind !== job.media.mediaKind) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profile", "output", "mediaKind"], message: "Preview output type must match the selected source." });
  if (job.range.endSeconds > job.media.durationSeconds) context.addIssue({ code: z.ZodIssueCode.custom, path: ["range", "endSeconds"], message: "Preview range cannot extend beyond the media duration." });
  if (job.state === "succeeded" && !job.artifact) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifact"], message: "A successful preview requires a validated artifact." });
  if ((job.state === "failed" || job.state === "cancelled") && job.artifact) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifact"], message: "A failed or cancelled preview cannot expose an artifact." });
  if (job.state === "failed" && !job.failure) context.addIssue({ code: z.ZodIssueCode.custom, path: ["failure"], message: "A failed preview requires a safe failure." });
});
export const createPreviewJobRequestSchema = z.object({ media: mediaMetadataSchema, profile: processingProfileSchema, currentTimeSeconds: z.number().finite().nonnegative() });
export const previewEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), jobId: z.string().uuid(), sequence: z.number().int().positive(), phase: z.string().min(1).max(80), progress: z.number().min(0).max(1).optional(), elapsedMs: z.number().int().nonnegative() }),
  z.object({ type: z.literal("succeeded"), jobId: z.string().uuid(), sequence: z.number().int().positive(), elapsedMs: z.number().int().nonnegative(), artifact: previewArtifactSchema }),
  z.object({ type: z.literal("failed"), jobId: z.string().uuid(), sequence: z.number().int().positive(), elapsedMs: z.number().int().nonnegative(), failure: previewFailureSchema }),
  z.object({ type: z.literal("cancelled"), jobId: z.string().uuid(), sequence: z.number().int().positive(), elapsedMs: z.number().int().nonnegative() }),
]);
export const previewCommandSchema = z.discriminatedUnion("command", [z.object({ command: z.literal("event"), event: previewEventSchema }), z.object({ command: z.literal("cancel") }), z.object({ command: z.literal("retry") })]);
export const previewJobEnvelopeSchema = z.object({ data: previewJobSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable(), requestId: z.string() });
export type PreviewRange = z.infer<typeof previewRangeSchema>;
export type PreviewJob = z.infer<typeof previewJobSchema>;
export type PreviewEvent = z.infer<typeof previewEventSchema>;
export type PreviewArtifact = z.infer<typeof previewArtifactSchema>;
export type PreviewJobErrorCode = "INVALID_MEDIA" | "INVALID_PROFILE" | "INVALID_RANGE" | "SOURCE_TARGET" | "RUNTIME_UNAVAILABLE" | "MODEL_UNAVAILABLE" | "STORAGE_UNAVAILABLE" | "DISK_SPACE_LOW" | "JOB_NOT_FOUND" | "INVALID_TRANSITION";
export class PreviewJobError extends Error { constructor(readonly code: PreviewJobErrorCode, message: string) { super(message); this.name = "PreviewJobError"; } }
export function getPreviewRange(currentTimeSeconds: number, durationSeconds: number): PreviewRange {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(currentTimeSeconds)) throw new PreviewJobError("INVALID_RANGE", "A usable media duration and playhead position are required to create a preview.");
  const length = Math.min(durationSeconds, MAX_PREVIEW_DURATION_SECONDS); const startSeconds = Math.min(Math.max(currentTimeSeconds - length / 2, 0), durationSeconds - length);
  return previewRangeSchema.parse({ startSeconds, endSeconds: startSeconds + length });
}
export function createPreviewJob(mediaInput: unknown, profileInput: unknown, currentTimeSeconds: number, options: { id?: string; createdAt?: string; modelVersions?: Record<string, string>; retryOf?: string } = {}): PreviewJob {
  const media = mediaMetadataSchema.safeParse(mediaInput);
  if (!media.success) throw new PreviewJobError("INVALID_MEDIA", "Select a readable local audio stream before creating a preview.");
  const selectedStreamId = media.data.selectedAudioStreamId ?? media.data.audioStream.id;
  const selectedStream = media.data.audioStreams?.find((stream) => stream.id === selectedStreamId) ?? media.data.audioStream;
  if (!selectedStream.present) throw new PreviewJobError("INVALID_MEDIA", "The selected media does not contain a readable audio stream.");
  if (typeof profileInput === "object" && profileInput !== null && "output" in profileInput && typeof profileInput.output === "object" && profileInput.output !== null && "destination" in profileInput.output && typeof profileInput.output.destination === "object" && profileInput.output.destination !== null && "targetRef" in profileInput.output.destination && profileInput.output.destination.targetRef === "source") throw new PreviewJobError("SOURCE_TARGET", "The original source cannot be used as a preview or output target.");
  const parsedProfile = processingProfileSchema.safeParse(profileInput);
  if (!parsedProfile.success) throw new PreviewJobError("INVALID_PROFILE", "Review the enhancement and output settings before creating a preview.");
  const profile = normalizeProcessingProfile(parsedProfile.data);
  if (profile.mediaRef !== media.data.sourceRef || profile.selectedAudioStreamId !== selectedStreamId || profile.output.mediaKind !== media.data.mediaKind) throw new PreviewJobError("INVALID_PROFILE", "The enhancement profile no longer matches the selected media or audio stream. Review the profile and try again.");
  if (profile.output.destination.targetRef === "source") throw new PreviewJobError("SOURCE_TARGET", "The original source cannot be used as a preview or output target.");
  const now = options.createdAt ?? new Date().toISOString();
  return previewJobSchema.parse({ id: options.id ?? crypto.randomUUID(), kind: "preview", state: "queued", sequence: 0, createdAt: now, updatedAt: now, media: media.data, profile, range: getPreviewRange(currentTimeSeconds, media.data.durationSeconds), modelVersions: options.modelVersions ?? {}, retryOf: options.retryOf, elapsedMs: 0 });
}
export function previewProfileMatches(job: PreviewJob, profile: ProcessingProfile) { return JSON.stringify(job.profile) === JSON.stringify(normalizeProcessingProfile(profile)); }
export function previewJobMatches(job: PreviewJob, profile: ProcessingProfile, currentTimeSeconds: number, durationSeconds: number) { try { const range = getPreviewRange(currentTimeSeconds, durationSeconds); return previewProfileMatches(job, profile) && job.range.startSeconds === range.startSeconds && job.range.endSeconds === range.endSeconds; } catch { return false; } }
