import { z } from "zod";

export const processingProfileIds = ["speech", "music", "mixed-audio"] as const;
export const processingProfileIdSchema = z.enum(processingProfileIds);
