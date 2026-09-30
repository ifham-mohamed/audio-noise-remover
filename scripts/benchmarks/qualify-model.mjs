import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import process from "node:process";
import { evaluateQualification, qualificationManifestSchema, verifyLocalEvidence } from "./model-qualification.ts";

// Read-only CLI: redirect stdout to a NEW local report; never accepts output/media destinations.
try {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error("Usage: node scripts/benchmarks/qualify-model.mjs <manifest.json|--schema>");
  if (args[0] === "--schema") {
    process.stdout.write(`${JSON.stringify(z.toJSONSchema(qualificationManifestSchema), null, 2)}\n`);
  } else {
    const path = resolve(args[0]);
    const report = evaluateQualification(JSON.parse(readFileSync(path, "utf8")), verifyLocalEvidence(dirname(path)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.qualified ? 0 : 2;
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ qualified: false, error: error instanceof Error ? error.message : "Invalid input" })}\n`);
  process.exitCode = 2;
}
