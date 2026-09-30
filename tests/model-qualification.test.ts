import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateQualification, fileSha256, median, qualificationManifestSchema, verifyLocalEvidence } from "../scripts/benchmarks/model-qualification";

// Entirely synthetic evaluator fixtures: these are never actual model evidence.
function fixture() {
  const rights = { license: "synthetic-test-license", noticeEvidence: "e", attribution: "test",
    reviewer: "test", reviewEvidence: "e", evaluationAllowed: true, productionUseAllowed: true };
  const declaration = { status: "verified" as const, reviewer: "test", method: "synthetic", evidenceIds: ["e"] };
  const metrics = { stoiBefore: 0.5, stoiAfter: 0.55, siSdrBeforeDb: 0, siSdrAfterDb: 3,
    pesqBefore: 4, pesqAfter: 4, introducedClippedSamples: 0, encodedTruePeakDbtp: -1,
    integratedLufs: -16, targetLufs: -16, durationValid: true, channelsValid: true,
    encodedArtifactValid: true, sourceUnchanged: true };
  const clip = { id: "noisy", kind: "noisy" as const, speaker: "s", speechDataset: "data", noiseDataset: "data",
    noiseSource: "n", noiseClass: "real", sourceEvidence: ["e"], measurementEvidence: "e", outputEvidence: "e",
    startSample: 0, lengthSamples: 48000, sampleRateHz: 48000, snrDb: 0, metrics };
  return qualificationManifestSchema.parse({
    schemaVersion: 1, runId: "synthetic-test-only", purpose: "production-qualification",
    evidence: [{ id: "e", path: "synthetic", sha256: "a".repeat(64) }],
    model: { id: "test", revision: "test", artifactEvidence: "e", conversion: "test", conversionEvidence: "e", rights },
    datasets: [{ id: "data", revision: "test", source: "test", representation: "test", split: "test", roles: ["speech", "noise"], rights }],
    independence: { evaluation: declaration, training: { corpora: ["test"], sources: declaration, speakers: declaration, noise: declaration } },
    protocol: { seed: 0, selection: "test", preprocessing: "test", alignment: "test",
      metricImplementations: { stoi: { name: "STOI", version: "test@1", evidenceId: "e" }, "si-sdr": { name: "SI-SDR", version: "test@1", evidenceId: "e" }, "pesq-clean": { name: "PESQ", version: "test@1", evidenceId: "e" } }, metricRights: rights,
      profile: "test", targetLufs: -16, profileEvidence: "e", preregistrationEvidence: "e", minimumNoisyClips: 1, minimumCleanClips: 1,
      minimumSpeakers: 1, minimumNoiseSources: 1, requiredNoiseClasses: ["real"],
      acceptance: { reviewEvidence: "e", maximumRtf: 1, maximumPeakMemoryMb: 100, maximumColdLoadMs: 1000,
        maximumCancellationMs: 100, minimumListeners: 2, minimumTrials: 2 } },
    clips: [clip, { ...clip, id: "clean", kind: "clean" }],
    runtime: ["windows", "macos", "linux"].map((platform) => ({ platform, machine: "test", browser: "test", runtimeVersion: "1",
      provider: "cpu", threads: 1, evidenceIds: ["e"], actualMedia: true, appPath: true, coldStartOffline: true,
      warmRtf: [1], coldLoadMs: 1000, peakMemoryMb: 100, cancellationMs: 100, cleanupVerified: true })),
    listening: { blinded: true, randomized: true, loudnessMatched: true, protocolEvidence: "e", trials: ["a", "b"].map((listener) => ({ listener, clipId: "noisy", evidenceId: "e", speechDamage: false, unacceptableArtifacts: false })) },
  });
}
const report = (m: unknown) => evaluateQualification(m, () => true);
const gate = (m: unknown, id: string) => report(m).gates.find((g) => g.id === id)!;

describe("model qualification (synthetic evaluator checks only)", () => {
  it("accepts a fully attested synthetic fixture, including boundary runtime values", () => expect(report(fixture()).qualified).toBe(true));
  it("calculates paired medians with even sample counts", () => { expect(median([4, 1, 2, 3])).toBe(2.5); expect(() => median([])).toThrow(); });
  it.each([undefined, {}, { schemaVersion: 1 }, { ...fixture(), extra: true }])("fails closed on invalid/missing/unknown fields", (m) => expect(report(m).qualified).toBe(false));
  it("requires actual hash verification", () => {
    expect(evaluateQualification(fixture()).qualified).toBe(false);
    expect(evaluateQualification(fixture(), () => false).qualified).toBe(false);
    expect(evaluateQualification(fixture(), () => { throw new Error("absent"); }).qualified).toBe(false);
  });
  it("streams and checks real retained file hashes", () => {
    const path = "scripts/benchmarks/model-qualification.ts";
    const verifier = verifyLocalEvidence(process.cwd());
    expect(verifier({ id: "test", path, sha256: fileSha256(path) })).toBe(true);
    expect(verifier({ id: "test", path, sha256: "0".repeat(64) })).toBe(false);
  });
  it("blocks private diagnostics and noncommercial rights", () => {
    const m = fixture(); m.purpose = "private-diagnostic"; expect(gate(m, "rights").status).toBe("fail");
    m.purpose = "production-qualification"; m.datasets[0].rights.productionUseAllowed = false; expect(report(m).qualified).toBe(false);
  });
  it("does not infer training independence from an independent dataset", () => {
    const m = fixture(); m.independence.training.speakers.status = "unknown"; expect(gate(m, "independence").status).toBe("fail");
  });
  it("rejects dangling references and duplicate clip IDs", () => {
    const m = fixture(); m.model.artifactEvidence = "missing"; expect(gate(m, "manifest").status).toBe("fail");
    m.model.artifactEvidence = "e"; m.clips[1].id = "noisy"; expect(report(m).qualified).toBe(false);
  });
  it("enforces preregistered coverage and noise classes", () => {
    const m = fixture(); m.protocol.minimumSpeakers = 2; expect(gate(m, "coverage").status).toBe("fail");
    m.protocol.minimumSpeakers = 1; m.protocol.requiredNoiseClasses.push("stationary"); expect(report(m).qualified).toBe(false);
  });
  it("cannot inflate clip counts by renaming the same evaluated segment", () => {
    const m = fixture(); m.clips.push({ ...m.clips[0], id: "duplicate-segment" });
    expect(gate(m, "manifest").status).toBe("fail");
  });
  it("cannot evade duplicate segments by aliasing source evidence or speaker labels", () => {
    const m = fixture(); m.evidence.push({ ...m.evidence[0], id: "alias" });
    m.clips.push({ ...m.clips[0], id: "renamed", speaker: "renamed-speaker", sourceEvidence: ["alias"] });
    expect(gate(m, "manifest").status).toBe("fail");
  });
  it("rejects missing, NaN and infinite metrics", () => {
    const m = fixture(); delete m.clips[0].metrics.stoiAfter; expect(gate(m, "stoi").status).toBe("missing");
    m.clips[0].metrics.stoiAfter = NaN; expect(report(m).qualified).toBe(false);
    m.clips[0].metrics.stoiAfter = Infinity; expect(report(m).qualified).toBe(false);
  });
  it("uses medians of paired deltas and fails a STOI/SI-SDR miss", () => {
    const m = fixture(); m.clips[0].metrics.stoiAfter = 0.5097; expect(gate(m, "stoi").status).toBe("fail");
    m.clips[0].metrics.siSdrAfterDb = 2.999; expect(gate(m, "si-sdr").status).toBe("fail");
  });
  it("never substitutes clean STOI or ViSQOL for missing PESQ", () => {
    const m = fixture(); delete m.clips[1].metrics.pesqAfter; expect(gate(m, "pesq-clean").status).toBe("missing");
    const n = fixture(); n.protocol.metricImplementations["pesq-clean"].name = "ViSQOL"; expect(gate(n, "pesq-clean").status).toBe("missing");
  });
  it("accepts exact inclusive STOI and clean PESQ boundaries", () => {
    const m = fixture(); m.clips[0].metrics.stoiAfter = 0.53; m.clips[1].metrics.pesqAfter = 3.9;
    expect(report(m).qualified).toBe(true);
  });
  it("blocks worst-case clean regression even if aggregate would pass", () => {
    const m = fixture(); m.clips[1].metrics.pesqAfter = 3.89; expect(gate(m, "pesq-clean").status).toBe("fail");
  });
  it("requires encoded true peak, not just sample peaks", () => {
    const m = fixture(); delete m.clips[0].metrics.encodedTruePeakDbtp; expect(gate(m, "clipping").status).toBe("missing");
    m.clips[0].metrics.encodedTruePeakDbtp = 0.01; expect(gate(m, "clipping").status).toBe("fail");
  });
  it("requires configured loudness target, inclusive 1 LU", () => {
    const m = fixture(); m.clips[0].metrics.integratedLufs = -15; expect(gate(m, "loudness").status).toBe("pass");
    m.clips[0].metrics.targetLufs = -15; expect(gate(m, "loudness").status).toBe("fail");
  });
  it("blocks invalid outputs and overwritten sources", () => {
    const m = fixture(); m.clips[0].metrics.sourceUnchanged = false; expect(gate(m, "output-integrity").status).toBe("fail");
  });
  it("rejects missing platforms, warm-only offline smoke and excessive memory", () => {
    const m = fixture(); m.runtime!.pop(); expect(gate(m, "runtime").status).toBe("missing");
    const n = fixture(); n.runtime![0].coldStartOffline = false; expect(gate(n, "runtime").status).toBe("fail");
    n.runtime![0].peakMemoryMb = 101; expect(gate(n, "memory").status).toBe("fail");
  });
  it("requires multi-listener damage review; preference alone cannot pass", () => {
    const m = fixture(); m.listening!.trials.pop(); expect(gate(m, "listening").status).toBe("fail");
    const n = fixture(); n.listening!.trials[0].speechDamage = true; expect(report(n).qualified).toBe(false);
  });
  it("fails on unfinished clipping, loudness and output measurements", () => {
    const m = fixture(); m.clips[0].metrics.introducedClippedSamples = 1; expect(gate(m, "clipping").status).toBe("fail");
    delete m.clips[0].metrics.targetLufs; expect(gate(m, "loudness").status).toBe("missing");
    delete m.clips[0].metrics.durationValid; expect(gate(m, "output-integrity").status).toBe("missing");
  });
  it("blocks CPU runtime budget violations and task cleanup failure", () => {
    const m = fixture(); m.runtime![0].warmRtf = [1.01]; expect(gate(m, "runtime").status).toBe("fail");
    m.runtime![0].warmRtf = [1]; m.runtime![0].cleanupVerified = false; expect(report(m).qualified).toBe(false);
  });
  it("exports a usable schema without claiming qualification", () => {
    const result = spawnSync(process.execPath, ["scripts/benchmarks/qualify-model.mjs", "--schema"], { encoding: "utf8" });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout).properties.schemaVersion.const).toBe(1);
  });
  it("CLI exits 2 for incomplete existing model setup metadata", () => {
    const result = spawnSync(process.execPath, ["scripts/benchmarks/qualify-model.mjs", "models/manifest.json"], { encoding: "utf8" });
    expect(result.status).toBe(2); expect(JSON.parse(result.stdout).qualified).toBe(false);
  });
  it("CLI exits 2 for absent evidence without pretending to measure it", () => {
    const result = spawnSync(process.execPath, ["scripts/benchmarks/audit-current-qualification.mjs", "scripts/benchmarks/nonexistent-diagnostic"], { encoding: "utf8" });
    expect(result.status).toBe(2); const current = JSON.parse(result.stdout);
    expect(current.qualified).toBe(false); expect(current.legacyDiagnostic.status).toBe("missing");
  });
  it("public audit errors never expose a supplied private location", () => {
    const privateLocation = "C:/Users/private-reviewer/AppData/Local/Temp/absent-audio";
    const result = spawnSync(process.execPath, ["scripts/benchmarks/audit-current-qualification.mjs", privateLocation], { encoding: "utf8" });
    expect(result.status).toBe(2); expect(result.stdout).not.toContain("private-reviewer");
    const current = JSON.parse(result.stdout);
    expect(current.qualified).toBe(false); expect(current.legacyDiagnostic.error).not.toContain(privateLocation);
  });
  it("does not verify an empty input inventory or publish private summary prose", () => {
    const directory = mkdtempSync(join(tmpdir(), "model-qualification-synthetic-"));
    try {
      writeFileSync(join(directory, "per-clip.csv"), "pair_index,stoi_noisy,stoi_enhanced,sisdr_noisy_db,sisdr_enhanced_db,rtf_noisy,output_peak,clean_output_peak\n0,0.5,0.55,0,3,0.5,0.5,0.5\n");
      writeFileSync(join(directory, "summary.json"), JSON.stringify({ pairs: 1,
        medians: { stoi_gain: 0.05, sisdr_gain_db: 3, rtf_noisy: 0.5 }, output_sample_clips: 0, stoi_regressions: 0,
        provenance: { inputs: {}, model_sha256: "a".repeat(64) },
        limitations: ["C:/Users/private-reviewer/secret-audio"], independence_note: "private-reviewer",
      }));
      const result = spawnSync(process.execPath, ["scripts/benchmarks/audit-current-qualification.mjs", directory], { encoding: "utf8" });
      expect(result.status).toBe(2); const current = JSON.parse(result.stdout);
      expect(current.legacyDiagnostic.status).toBe("fail");
      expect(current.legacyDiagnostic.inputVerification.recorded).toBe(0);
      expect(result.stdout).not.toContain(directory); expect(result.stdout).not.toContain("private-reviewer");
      writeFileSync(join(directory, "summary.json"), "{}");
      const invalid = spawnSync(process.execPath, ["scripts/benchmarks/audit-current-qualification.mjs", directory], { encoding: "utf8" });
      expect(JSON.parse(invalid.stdout).legacyDiagnostic.status).toBe("fail");
    } finally { rmSync(directory, { recursive: true }); }
  });
  it("committable report contains only relative paths and aggregate input checks", () => {
    const raw = readFileSync("scripts/benchmarks/current-qualification-report.json", "utf8");
    const current = JSON.parse(raw);
    expect(raw).not.toMatch(/[A-Za-z]:[\\/]|\\\\|\/Users\/|\/home\/|ADMINI|Administrator/i);
    expect(current.legacyDiagnostic.directory).toBeUndefined();
    expect(current.legacyDiagnostic.recordedInputs).toBeUndefined();
    expect(current.legacyDiagnostic.inputVerification).toEqual({ expected: 11, recorded: 11, matched: 11, missingOrMismatched: 0 });
    expect(current.legacyDiagnostic.evidence.map((e: {path: string}) => e.path)).toEqual(["summary.json", "per-clip.csv"]);
  });
  it("retains actual blocked snapshot and source identity, separate from synthetic tests", () => {
    const current = JSON.parse(readFileSync("scripts/benchmarks/current-qualification-report.json", "utf8"));
    expect(current.qualified).toBe(false); expect(current.gates.some((g: {id: string; status: string}) => g.id === "stoi" && g.status === "fail")).toBe(true);
    expect(current.gates.some((g: {status: string}) => g.status === "pass")).toBe(false);
    expect(current.legacyDiagnostic.pairs).toBe(100);
    expect(current.legacyDiagnostic.medianStoiGain).toBeCloseTo(0.05034065912464225, 12);
    expect(current.sources.find((s: {path: string}) => s.path === "scripts/benchmarks/ears-wham-independent-diagnostic.py").sha256)
      .toBe(fileSha256("scripts/benchmarks/ears-wham-independent-diagnostic.py"));
  });
});
