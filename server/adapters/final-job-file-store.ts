import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { finalJobSchema, type FinalJob } from "@/shared/contracts/final-job";

const MAX_STORE_BYTES = 10 * 1024 * 1024;
const storeSchema = z.strictObject({ version: z.literal(1), jobs: z.array(finalJobSchema) }).superRefine(({ jobs }, context) => {
  const ids = new Set<string>();
  jobs.forEach((job, index) => { if (ids.has(job.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["jobs", index, "id"], message: "Final job IDs must be unique." }); ids.add(job.id); });
});
export type FinalJobStore = { load(): FinalJob[]; save(jobs: readonly FinalJob[]): void };
export function defaultFinalJobStorePath() { return process.env.AI_NOICE_FINAL_JOB_STORE_PATH ?? path.join(os.homedir(), ".ai-noice-removal", "final-jobs.json"); }
export function createFinalJobFileStore(filePath = defaultFinalJobStorePath()): FinalJobStore {
  const directory = path.dirname(filePath);
  return {
    load() {
      if (!existsSync(filePath)) return [];
      const file = statSync(filePath);
      if (!file.isFile() || file.size > MAX_STORE_BYTES) throw new Error("The local final-job store is not a valid bounded file.");
      let decoded: unknown;
      try { decoded = JSON.parse(readFileSync(filePath, "utf8")); } catch { throw new Error("The local final-job store could not be read or parsed."); }
      const parsed = storeSchema.safeParse(decoded);
      if (!parsed.success) throw new Error("The local final-job store failed schema validation.");
      return parsed.data.jobs;
    },
    save(jobs) {
      const contents = JSON.stringify(storeSchema.parse({ version: 1, jobs }));
      if (Buffer.byteLength(contents, "utf8") > MAX_STORE_BYTES) throw new Error("The local final-job store exceeds its safe size limit.");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      let descriptor: number | undefined;
      try {
        descriptor = openSync(temporaryPath, "wx", 0o600); writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined; renameSync(temporaryPath, filePath);
      } finally { if (descriptor !== undefined) closeSync(descriptor); if (existsSync(temporaryPath)) unlinkSync(temporaryPath); }
    },
  };
}
