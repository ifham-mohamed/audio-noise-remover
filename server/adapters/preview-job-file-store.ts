import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { previewJobSchema, type PreviewJob } from "@/shared/contracts/preview";

const MAX_STORE_BYTES = 10 * 1024 * 1024;
const previewJobStoreSchema = z.strictObject({
  version: z.literal(1),
  jobs: z.array(previewJobSchema),
}).superRefine(({ jobs }, context) => {
  const ids = new Set<string>();
  jobs.forEach((job, index) => {
    if (ids.has(job.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["jobs", index, "id"], message: "Preview job IDs must be unique." });
    ids.add(job.id);
  });
});

export type PreviewJobStore = {
  load(): PreviewJob[];
  save(jobs: readonly PreviewJob[]): void;
};

export function defaultPreviewJobStorePath() {
  return process.env.AI_NOICE_PREVIEW_JOB_STORE_PATH ?? path.join(os.homedir(), ".ai-noice-removal", "preview-jobs.json");
}

export function createPreviewJobFileStore(filePath = defaultPreviewJobStorePath()): PreviewJobStore {
  const directory = path.dirname(filePath);

  return {
    load() {
      if (!existsSync(filePath)) return [];
      const file = statSync(filePath);
      if (!file.isFile() || file.size > MAX_STORE_BYTES) throw new Error("The local preview job store is not a valid bounded file.");
      let decoded: unknown;
      try {
        decoded = JSON.parse(readFileSync(filePath, "utf8"));
      } catch {
        throw new Error("The local preview job store could not be read or parsed.");
      }
      const parsed = previewJobStoreSchema.safeParse(decoded);
      if (!parsed.success) throw new Error("The local preview job store failed schema validation.");
      return parsed.data.jobs;
    },

    save(jobs) {
      const snapshot = previewJobStoreSchema.parse({ version: 1, jobs });
      const contents = JSON.stringify(snapshot);
      if (Buffer.byteLength(contents, "utf8") > MAX_STORE_BYTES) throw new Error("The local preview job store exceeds its safe size limit.");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      let descriptor: number | undefined;
      try {
        descriptor = openSync(temporaryPath, "wx", 0o600);
        writeFileSync(descriptor, contents, "utf8");
        fsyncSync(descriptor);
        closeSync(descriptor);
        descriptor = undefined;
        renameSync(temporaryPath, filePath);
      } finally {
        if (descriptor !== undefined) closeSync(descriptor);
        if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
      }
    },
  };
}
