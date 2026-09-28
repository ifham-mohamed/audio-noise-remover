import { z } from "zod";

export const capabilityStatusSchema = z.enum(["ready", "attention", "unavailable", "limited"]);
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;

export const capabilityCodeSchema = z.enum([
  "FFMPEG_UNAVAILABLE",
  "MODEL_UNAVAILABLE",
  "STORAGE_NOT_WRITABLE",
  "DISK_SPACE_LOW",
  "ACCELERATOR_UNAVAILABLE",
  "BROWSER_LIMITATION",
  "RUNTIME_CHECK_FAILED",
]);
export type CapabilityCode = z.infer<typeof capabilityCodeSchema>;

export const capabilityItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: capabilityStatusSchema,
  summary: z.string(),
  detail: z.string().optional(),
  version: z.string().optional(),
  code: capabilityCodeSchema.optional(),
  actionLabel: z.string().optional(),
});
export type CapabilityItem = z.infer<typeof capabilityItemSchema>;

export const capabilityReportSchema = z.object({
  generatedAt: z.string(),
  requestId: z.string(),
  runtime: z.object({ nodeVersion: z.string(), os: z.string(), architecture: z.string() }),
  items: z.array(capabilityItemSchema),
});
export type CapabilityReport = z.infer<typeof capabilityReportSchema>;

export const apiEnvelopeSchema = z.object({
  data: capabilityReportSchema.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  requestId: z.string(),
});

function sanitizeDiagnosticValue(value: string) {
  return value.replace(/[\\/:?#\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function buildDiagnosticText(report: CapabilityReport) {
  const lines = [
    "Clearwave Studio local diagnostics",
    `Generated: ${report.generatedAt}`,
    `Request ID: ${report.requestId}`,
    `Runtime: ${sanitizeDiagnosticValue(report.runtime.nodeVersion)} on ${sanitizeDiagnosticValue(report.runtime.os)} ${sanitizeDiagnosticValue(report.runtime.architecture)}`,
    "",
    ...report.items.map((item) => `${sanitizeDiagnosticValue(item.label)}: ${item.status.toUpperCase()} — ${sanitizeDiagnosticValue(item.summary)}${item.version ? ` (${sanitizeDiagnosticValue(item.version)})` : ""}`),
  ];
  return lines.join("\n");
}
