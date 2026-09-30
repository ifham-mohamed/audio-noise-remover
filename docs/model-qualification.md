# Production model qualification

The candidate remains **unqualified**. This workflow validates retained local evidence; it does not manufacture measurements, infer rights from a code license, or select a model/default. The governing thresholds are in [implementation-contract.md](../_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md). Historical evidence is in [speech-model-bakeoff.md](../_bmad-output/implementation-artifacts/speech-model-bakeoff.md) and [model-artifacts.md](model-artifacts.md).

## Current evidence (2026-10-01)

[current-qualification-report.json](../scripts/benchmarks/current-qualification-report.json) records an actual read-only audit of the retained 100-pair EARS/WHAM CSV and summary. The locally installed publisher model hash matches the diagnostic model hash; all eleven recorded input hashes match. Recomputed paired medians match the summary: STOI +0.0503406591, SI-SDR +6.776558646 dB, native CPU RTF 0.4089919125; one STOI regression and zero diagnostic output sample clips. No inference was rerun, media downloaded, or audio copied. The commit-safe report retains repository-relative source paths, result basenames, dataset labels and aggregate verification counts. Absolute input locations and individual input hashes remain only in the original private local summary, which is not copied into the repository. Raw errors and free-form private summary prose are excluded from the public report; OS-temp retention is not durable evidence storage.

These are private diagnostic results, not production passes. The larger VoiceBank+DEMAND result documents median STOI **+0.0097**, below +0.03. EARS/WHAM terms restrict commercial use; training source/speaker/noise non-overlap remains unverified. The historical sample-peak result is not encoded true-peak validation, native CPU RTF is not app performance, and a different dataset's success cannot erase a failure. The saved report keeps the documented failure and missing production gates visible.

Remaining blockers: independently rights-reviewed speech and real-noise fixtures with candidate-specific training non-overlap; approved coverage and performance budgets; lawful measured PESQ clean regression; configured loudness and encoded clipping/true-peak checks; blinded multi-listener damage review; full-output validation; actual-media CPU app performance, cold offline startup, cancellation/cleanup and peak memory on Windows, macOS and Linux. VOiCES remains a possible source, not adopted data: the existing bake-off records oversized archives and disk constraints. No large archive acquisition is part of this workflow.

## Run locally

Run these commands from the repository root using the existing installed Node 24.19.0 runtime and lockfile dependencies. The `.mjs` entry points import the `.ts` library using Node's native type stripping; no compilation step, ts-node, tsx or `ts-nocheck` is required. Standard TypeScript checking validates the library and extensionless test imports; it does not compile the JavaScript entry points (`allowJs` is false). No additional packages, external scorer service, or network access are required to evaluate already measured evidence.

```powershell
node scripts/benchmarks/qualify-model.mjs --schema
node scripts/benchmarks/qualify-model.mjs C:\local-evaluation\manifest.json
node scripts/benchmarks/audit-current-qualification.mjs
# Optional existing local diagnostic directory:
node scripts/benchmarks/audit-current-qualification.mjs C:\local-evaluation\legacy-diagnostic
npm run test -- tests/model-qualification.test.ts
npm run typecheck
```

Reports go to stdout. Qualification exits 0 only when every gate passes; missing/failed evidence, invalid JSON, absent files and wrong hashes exit 2. The audit always exits 2 because it is not a production qualification. Schema export exits 0 and makes no qualification claim. Native Node may emit a module-type warning for the TypeScript library; no package configuration change is needed. Save results only to a new local report path; these commands never write over sources or accept media/output destinations.

## Manifest contract

The versioned Zod schema in [model-qualification.ts](../scripts/benchmarks/model-qualification.ts) is authoritative; `--schema` exports its JSON Schema for data preparation. Objects reject unknown fields, coercion, empty declarations and nonfinite metrics. Missing measurement fields are accepted as incomplete evidence and produce `missing` gates, never zero-valued defaults. Invalid structural fields invalidate the manifest and block all measurements. Paths resolve relative to the manifest file; absolute local paths are allowed. SHA-256 hashes are lowercase hex and are streamed rather than loading corpora into memory.

Supply one run for one immutable artifact and processing profile. Retain the following locally:

- `schemaVersion: 1`, a unique `runId`, and `purpose` (`private-diagnostic` or `production-qualification`). Private runs cannot qualify for production.
- An `evidence` inventory of unique `{id, path, sha256}` entries: weights, conversion recipe, notices, signed/reviewed decisions, protocol, scorer implementations, source recordings, measurement logs and encoded outputs. Every referenced ID must resolve and every retained file must hash correctly. Hashes prove identity, not correctness or legal permission; reviewers must inspect the evidence contents.
- `model`: ID/revision, `artifactEvidence`, conversion description and `conversionEvidence`, and independent weight/conversion rights review. `datasets`: unique IDs, pinned revisions, source, representation (including lossy rehosting), split, speech/noise roles, and individual rights reviews. Each `rights` record requires license, notice evidence, attribution, named reviewer and review evidence, and explicit `evaluationAllowed`/`productionUseAllowed` booleans. Model cards, source-code licenses and private PESQ permission alone are insufficient.
- `independence.evaluation`: separately reviewed selection independence. `independence.training`: declared candidate training corpora and distinct `sources`, `speakers`, and `noise` reviews. Every declaration has `status` (`verified`, `unknown`, `overlap`), reviewer, method, and retained evidence IDs. A test-split name or omission from a paper's dataset list is not proof of non-overlap. Unknown or overlapping training sources block qualification.
- `protocol`: fixed seed, deterministic selection, preprocessing/resampling and alignment descriptions, profile and evidence, explicit approved `targetLufs`, preregistration evidence, minimum noisy/clean clips, speakers and noise sources, and required noise classes. `metricImplementations` entries contain `{name, version, evidenceId}` under `stoi`, `si-sdr`, and `pesq-clean`; names must be `STOI`, `SI-SDR`, and `PESQ`. Include scorer `metricRights`. Log alignment/latency and exclusions; do not tune per candidate after reviewing held-out outcomes.
- `protocol.acceptance`: retained review evidence for explicit maximum RTF, peak memory MB, cold-load milliseconds, cancellation milliseconds, minimum listeners and trials. The repository has no numerical performance/memory budget or sample-size policy; this evaluator requires a reviewed choice rather than inventing defaults. A listening panel must contain at least two distinct listeners regardless of a smaller proposed budget. These acceptance choices require owner review; this workflow does not adopt them.
- `clips`: unique IDs, clean/noisy kind, speaker and dataset linkage, real source IDs, source/measurement/output evidence, exact start and length in samples, rate, noisy source/class, and paired measurements. Record `noiseStartSample`, `mixtureGain` and `snrDb` for constructed mixtures; natural paired recordings may omit these. Duplicate evaluated segments under renamed IDs are rejected. Do not treat repeated mixtures as independent noise sources or speakers. Measurement evidence must identify this run's artifact, profile, preprocessing and scorer, with before/after measurements traceable to each clip. Reviewers must check that linkage; the evaluator cannot judge the truth of a signed declaration or arbitrary log file.
- `runtime`: named machine, browser, runtime version, CPU provider, thread count, evidence IDs, actual-media/app-path/cold-start-offline assertions, warm RTF samples, cold load, measured peak memory, cancellation time and cleanup result. Include Windows, macOS and Linux. Graph zero-tensor tests, warmed online models and native-wrapper timing are insufficient.
- `listening`: blinded/randomized/loudness-matched assertions, protocol evidence and unique listener/clip trials with evidence, speech-damage and unacceptable-artifact findings. A preference vote cannot stand in for these findings. Retain mappings separately until judgments are submitted.

## Gate interpretation

| Gate | Required result |
| --- | --- |
| STOI | Median of per-noisy-clip `(after - before)` >= 0.03 |
| SI-SDR | Median of per-noisy-clip `(afterDb - beforeDb)` >= 3 dB |
| Clean PESQ | Worst per-clean-clip `(before - after)` <= 0.10; no STOI/ViSQOL substitution |
| Clipping | Every clean/noisy output has zero introduced clipped samples and encoded true peak <= 0 dBTP |
| Loudness | Every encoded output within 1 LU of the explicitly approved profile target |
| Output integrity | Every output validates duration, channels, encoded artifact and source immutability |
| Runtime/memory | Every reference platform meets reviewed CPU budgets, actual-media app/offline/cancellation/cleanup checks |
| Listening | Reviewed panel and trial count, blinded randomized matched levels, no unacceptable damage/artifacts |
| Eligibility | Complete valid manifest, verified retained hashes, production rights, independent training declarations and approved coverage |

PESQ uses the worst fixture because the contract does not authorize a median clean-speech regression to hide damage. Objective comparisons allow only 1e-12 arithmetic roundoff at the boundary. True peak <= 0 dBTP is the conservative no-full-scale-overrun rule; it does not invent a mastering loudness target. Coverage/runtime/listening budgets require explicit review. Report status is `pass`, `fail`, or `missing`; `qualified` is true only when all are `pass`. Individual metric passes cannot bypass eligibility failures or qualify another model hash/profile.

This is an evidence-validation tool, not a certification authority or a metric calculator. Tests use explicitly synthetic fixtures to exercise evaluator behavior; their passing assertions are not model passes. Real qualification still requires lawful local measurements, human reviews and retained artifacts. Trackers and deferred registers remain parent-owned; this work does not alter them.

Verification for this change: 33 focused tests passed, including direct installed-Node CLI runs, public-path redaction, private error/prose exclusion, empty-input failure, metric thresholds and duplicate-source alias rejection. Repository typecheck passed earlier in this work; its latest run reports unrelated concurrent errors in `tests/final-encoding.test.ts:106` and `:107`, with no qualification-file errors. Lint passed with `npm run lint -- --ignore-pattern 'tmp/**'`; unfiltered lint reports existing generated FFmpeg JavaScript errors under `tmp/ffmpeg-expanded/`. The lint configuration ignores TypeScript benchmark/test files, so their verification comes from typecheck and focused tests rather than a claimed lint pass. Other contributors' files and the existing diagnostic script were not edited.
