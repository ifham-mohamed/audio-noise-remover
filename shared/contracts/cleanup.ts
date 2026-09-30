import { z } from "zod";
import { finalJobSchema, cleanupResultSchema, cleanupScopeSchema } from "@/shared/contracts/final-job";
import { previewJobSchema } from "@/shared/contracts/preview";

export const cleanupPlanSchema = z.strictObject({ finalJobs: z.array(finalJobSchema), previewJobs: z.array(previewJobSchema) });
export const cleanupPlanEnvelopeSchema = z.strictObject({ data: cleanupPlanSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable(), requestId: z.string().uuid() });
export { cleanupResultSchema, cleanupScopeSchema };
