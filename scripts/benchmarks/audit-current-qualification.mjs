import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { fileSha256, median } from "./model-qualification.ts";

/** Read-only snapshot of existing evidence; never promotes legacy diagnostic aggregates. */
const root = resolve(import.meta.dirname, "../..");
const diagnostic = process.argv[2] ?? join(tmpdir(), "ears-wham-independent-diagnostic-r8j33xnw");
const sourcePaths = [
  "_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md",
  "_bmad-output/implementation-artifacts/speech-model-bakeoff.md",
  "docs/model-artifacts.md", "scripts/benchmarks/ears-wham-independent-diagnostic.py",
  "models/manifest.json", "models/dpdfnet2_48khz_hr.onnx",
  "scripts/benchmarks/model-qualification.ts", "scripts/benchmarks/qualify-model.mjs",
  "scripts/benchmarks/audit-current-qualification.mjs",
];
const sources = sourcePaths.map((path) => ({ path, sha256: existsSync(resolve(root, path)) ? fileSha256(resolve(root, path)) : null }));
const bakeoff = readFileSync(resolve(root, sourcePaths[1]), "utf8");
const expandedSection = bakeoff.split("### Expanded paired benchmark: 100 utterances")[1]?.split("\n### ")[0];
const documentedRow = expandedSection?.split(/\r?\n/).find((line) => line.startsWith("| DPDFNet2 48 kHz, 12 dB limit |"));
const documentedStoi = documentedRow?.split("|")[2]?.replaceAll("**", "").trim().match(/^[+-]?\d+(?:\.\d+)?/);
const observedStoi = documentedStoi ? Number(documentedStoi[0]) : undefined;
// Public output uses only fixed dataset labels and result basenames. The original
// ignored/local summary retains private locations and individual input hashes.
const legacy = { status: "missing", datasets: ["EARS test speech", "WHAM test noise"] };
try {
  const summaryPath = join(diagnostic, "summary.json");
  const csvPath = join(diagnostic, "per-clip.csv");
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
  // Existing producer uses unquoted identifier/numeric fields. Reject other CSV dialects.
  if (lines.some((line) => line.includes('"'))) throw new Error("Unsupported quoted CSV in diagnostic");
  const headers = lines.shift().split(",");
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate CSV headers");
  const rows = lines.map((line) => {
    const cells = line.split(",");
    if (cells.length !== headers.length) throw new Error("Malformed diagnostic CSV row");
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
  const values = (field) => rows.map((row) => {
    if (!row[field]?.trim() || !Number.isFinite(Number(row[field]))) throw new Error(`Missing/nonfinite ${field}`);
    return Number(row[field]);
  });
  const recordedInputs = Object.entries(summary.provenance.inputs).map(([path, sha256]) => {
    let matches = false;
    try { matches = fileSha256(path) === sha256; } catch { /* Retention failure is explicit evidence. */ }
    return { path, sha256, matches };
  });
  const inputVerification = {
    expected: 11, recorded: recordedInputs.length,
    matched: recordedInputs.filter((i) => i.matches).length,
    missingOrMismatched: recordedInputs.filter((i) => !i.matches).length,
  };
  const pairIds = values("pair_index");
  if (pairIds.some((id) => !Number.isInteger(id) || id < 0) || new Set(pairIds).size !== pairIds.length) throw new Error("Invalid or duplicate pair IDs");
  const stoiBefore = values("stoi_noisy");
  const stoiAfter = values("stoi_enhanced");
  if ([...stoiBefore, ...stoiAfter].some((v) => v < 0 || v > 1)) throw new Error("Invalid STOI range");
  const siSdrBefore = values("sisdr_noisy_db");
  const stoiGain = stoiAfter.map((v, i) => v - stoiBefore[i]);
  const siSdrGain = values("sisdr_enhanced_db").map((v, i) => v - siSdrBefore[i]);
  const rtf = values("rtf_noisy");
  const peaks = values("output_peak");
  const cleanPeaks = values("clean_output_peak");
  if ([...rtf, ...peaks, ...cleanPeaks].some((v) => v < 0)) throw new Error("Negative runtime or peak");
  const samplePeakClips = peaks.filter((v, i) => Math.max(v, cleanPeaks[i]) >= 1).length;
  const stoiRegressions = stoiGain.filter((v) => v < 0).length;
  const matchesSummary = rows.length === summary.pairs &&
    Math.abs(median(stoiGain) - summary.medians.stoi_gain) < 1e-12 &&
    Math.abs(median(siSdrGain) - summary.medians.sisdr_gain_db) < 1e-12 &&
    Math.abs(median(rtf) - summary.medians.rtf_noisy) < 1e-12 &&
    samplePeakClips === summary.output_sample_clips && stoiRegressions === summary.stoi_regressions;
  const modelMatches = sources.find((s) => s.path === "models/dpdfnet2_48khz_hr.onnx")?.sha256 === summary.provenance.model_sha256;
  Object.assign(legacy, {
    status: matchesSummary && modelMatches && inputVerification.recorded === inputVerification.expected && inputVerification.matched === inputVerification.expected ? "verified-diagnostic-only" : "fail",
    evidence: [{ path: "summary.json", sha256: fileSha256(summaryPath) }, { path: "per-clip.csv", sha256: fileSha256(csvPath) }],
    inputVerification, modelMatches, matchesSummary, pairs: rows.length,
    medianStoiGain: median(stoiGain), medianSiSdrGainDb: median(siSdrGain), medianNativeCpuRtf: median(rtf),
    stoiRegressions, samplePeakClips,
    limitations: [
      "Private non-commercial diagnostic only; not a production qualification.",
      "Opus-derived speech and seven reused noise recordings; training overlap unverified.",
      "No PESQ, listening panel, encoded true peak, approved loudness target or app-path qualification in this run.",
    ],
  });
} catch (error) {
  // Raw errors and summary prose can contain private file locations or usernames.
  legacy.status = ["ENOENT", "ENOTDIR"].includes(error?.code) ? "missing" : "fail";
  legacy.error = "Local diagnostic evidence is unavailable or invalid; consult the original private files.";
}

const gates = [
  { id: "manifest", status: "missing", detail: "No complete reviewed production manifest is supplied to this current-evidence audit.", source: sourcePaths[1] },
  { id: "stoi", status: observedStoi !== undefined && observedStoi < 0.03 ? "fail" : "missing",
    detail: observedStoi !== undefined ? `Documented 100-clip VoiceBank+DEMAND DPDFNet2 median STOI gain ${observedStoi}; required >= 0.03. Historical diagnostic evidence does not qualify production.` : "Documented VoiceBank+DEMAND row unavailable",
    ...(observedStoi === undefined ? {} : { value: observedStoi }), source: sourcePaths[1] },
  { id: "rights", status: "missing", detail: "No production evaluation rights review; existing EARS/WHAM data is non-commercial and PESQ permission is private/local only.", source: sourcePaths[1] },
  { id: "independence", status: "missing", detail: "Independent source, speaker and noise training-overlap declarations remain unverified.", source: sourcePaths[1] },
  { id: "coverage", status: "missing", detail: "No approved preregistered independent production manifest; legacy diagnostic cannot substitute.", source: sourcePaths[1] },
  ...Object.entries({
    "si-sdr": "Exploratory medians exceed 3 dB, but no rights-reviewed independent production per-clip run is supplied.",
    "pesq-clean": "No measured PESQ clean regression; STOI/ViSQOL cannot replace it. Prior Python binding build failed.",
    clipping: "Zero diagnostic sample clips does not establish encoded true peak or introduced clipping across final outputs.",
    loudness: "No approved configured target and full encoded-output loudness evidence.",
    listening: "Mixed six-trial, single-listener preferences do not establish blinded multi-listener speech-damage review.",
    runtime: "Native wrapper RTF and browser smoke do not establish actual-media CPU cold-offline app runs on all three platforms.",
    memory: "Peak memory on named Windows, macOS and Linux reference machines remains unmeasured.",
    "output-integrity": "Experimental preview integration does not establish independent qualification of final encoded outputs.",
  }).map(([id, detail]) => ({
    id, status: "missing", detail, source: sourcePaths[1],
  })),
];
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, qualified: false, label: "Current evidence audit, not a qualification run", sources, legacyDiagnostic: legacy, gates }, null, 2)}\n`);
process.exitCode = 2;
