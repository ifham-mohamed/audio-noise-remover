---
title: 'Deliver a Usable Local Speech Denoise and Clarity Workflow'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '90c17858a70e530a51b5eed18fd8bdb7af8b9f91'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-3-2-show-preview-progress-cancellation-and-failure.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-4-2-produce-and-validate-an-immutable-output.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has a constrained local experimental speech-denoising path, but voice clarity has no usable adapter, so users cannot independently apply both enhancements and save a result through one dependable workflow.

**Approach:** Deliver a local speech workflow using the existing pinned DPDFNet2 noise-removal adapter and WAV final-output path, plus a conservative, independent voice-presence DSP stage. Keep the model’s experimental status prominent; prioritize a real, validated artifact over unsupported format breadth.

## Boundaries & Constraints

**Always:** Process selected media and derived audio only on-device, in the browser worker; use canonical PCM between decode, ordered stages, and encode. Keep noise removal and voice clarity independently switchable, with voice clarity off by default. Apply clarity as a bounded presence EQ (peaking filter centered at 3 kHz, Q 0.8, 0–4 dB mapped to intensity 0–100), after denoising; clamp/sanitize output and detect non-finite samples. Keep CPU/WASM as baseline, cancellation/cleanup truthful, original immutable, and only validated distinct WAV output retrievable. Label every DPDFNet2-derived output experimental and not production-qualified.

**Never:** Enable a missing adapter; silently skip an enabled stage; claim a production-quality pass; change existing model gates; overwrite or return source audio as enhanced; upload media; expand output beyond the existing WAV final profile in this increment.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| DENOISE_ONLY | Supported speech media; noise removal enabled | Local inference produces validated experimental enhanced preview and WAV final output | Missing/checksum-invalid model fails with no artifact |
| CLARITY_ONLY | Supported media; clarity enabled; denoising disabled | Bounded clarity DSP produces local preview and validated WAV final output | Invalid samples/parameters fail safely; no partial artifact |
| COMBINED | Both controls enabled | Denoising runs before clarity; output is distinct, playable, and explicitly experimental | Cancellation/failure removes temporary output and leaves source unchanged |
| FORMAT_LIMIT | Non-WAV final output requested | UI explains that this increment exports WAV only; unsupported profile cannot start | Fail closed |

</frozen-after-approval>

## Code Map

- `features/preview/dpdfnet-adapter.ts`, `features/preview/preview-worker.ts`, `features/final/final-worker.ts` -- existing pinned model inference and local worker pipelines; compose the new stage in both flows without moving media into API requests.
- `shared/contracts/processing.ts`, `shared/contracts/processing-profiles.ts` -- effect IDs, parameters, order, and capability declarations; keep schemas in sync with availability.
- `features/editor/effect-inspector.tsx`, `features/editor/preview-action.tsx`, `features/editor/final-job-runner.tsx` -- independent controls and preview/final invocation; preserve user selection and clear experimental labeling.
- `features/final/final-artifact-store.ts`, `features/preview/preview-artifact-store.ts` -- WAV validation and distinct local retention; no new output format in this scope.
- `tests/` -- adapter, worker, artifact, UI, and Playwright coverage; add audio-signal assertions for stage ordering, frequency gain bounds, clipping/non-finite rejection, cancellation, and source immutability.
- `docs/ffmpeg-runtime.md`, `scripts/ffmpeg-wasm/Dockerfile` -- keep the browser 5.1.4 LGPL runtime separate from native 9.0.2; no runtime upgrade is needed for bounded WAV export.

## Tasks & Acceptance

**Execution:**
- [x] Inspect the current worker paths and verify DPDFNet2 setup, WAV profile, and artifact handoff; fix any integration gaps before adding a stage.
- [x] Add a shared pure voice-clarity DSP adapter implementing the bounded peaking-EQ mapping; validate parameter endpoints, finite coefficients/samples, gain response, and safe output headroom.
- [x] Wire stage execution into preview and final worker pipelines after denoising; honor disabled stages, progress, cancellation, and cleanup. Do not add inference/runtime imports to UI code.
- [x] Enable the voice-clarity control only when the adapter is available; default off, expose intensity independently, and identify the denoiser’s experimental quality status accessibly.
- [x] Verify local end-to-end WAV preview, comparison, final processing, validation, playback/download, and cancellation with both stages separately and together. Run all declared project checks.

**Remaining manual verification:**
- [ ] Audition denoise-only, clarity-only, and combined output on real speech and record whether the EQ suits the recording. This user listening check is not a production-model qualification result.

**Acceptance Criteria:**
- Given only noise removal is enabled and the verified local model is installed, when the user previews or processes a supported source, then the real denoiser produces a distinct validated local artifact labeled experimental.
- Given only voice clarity is enabled, when processing runs, then the clarity stage operates without invoking noise removal and stays within its declared frequency-gain/headroom bounds.
- Given both stages are enabled, when processing runs, then denoising precedes clarity and the resulting artifact is playable and validates as WAV.
- Given either stage is disabled, when a job runs, then it is omitted rather than applied with hidden defaults.
- Given cancellation, unsupported output, bad model integrity, invalid audio, or stage failure, when the job settles, then no incomplete artifact is exposed, temporary data is cleaned, and source bytes remain unchanged.

## Implementation Notes

- Added a local 3 kHz, Q 0.8 peaking EQ with intensity mapped to 0–4 dB; it rejects invalid rates/parameters and non-finite samples, caps peak output at 0.98, and returns separate output PCM.
- Wired clarity-only and denoise-then-clarity into both preview and final WAV workers. The clarity-only final path does not request DPDFNet; its execution record no longer falsely identifies a denoising model. Disabled effects stay omitted. The UI enables clarity, keeps it off by default, and explains the model’s experimental status and stage order.
- The model remains unqualified. This work does not assert perceptual speech improvement or production readiness. The repository has synthetic-tone fixtures only, so a human should audition personal speech recordings before relying on the effect.

## Spec Change Log

## Review Triage Log

- `patch` — `features/final/final-worker.ts`: a malformed `stages` array or missing intensity was dereferenced before validation, so no structured terminal event was guaranteed; both workers now use a shared schema/range validator before processing.
- `patch` — `features/final/final-worker.ts`: missing stage parameters could throw before failure reporting; the same shared validator now rejects malformed parameters before any artifact path starts.
- `false` — the reported claim that the new voice-clarity copy promises improved intelligibility is absent from the changed description; the actual copy now specifies only the bounded 3 kHz EQ and intensity mapping.
- `patch` — `features/editor/final-job-view.tsx`, `features/editor/final-output-review.tsx`: the success heading/player text was generic to the experimental model path even for clarity-only runs; completion messaging and playback labels now describe the selected clarity DSP path separately.
- `patch` — `tests/voice-clarity.test.ts`, `tests/e2e/preview-formats.pw.ts`: direct DSP checks rejected non-finite samples and invalid parameters, but worker-level invalid-profile/no-artifact coverage was missing; an invalid worker-profile browser test now asserts failure before artifact reopening.
- `patch` — this spec: automated work was marked complete while subjective listening remained outstanding; the user listening item is now an explicit unchecked manual verification, not a claimed pass.
- `patch` — `features/final/final-worker.ts`: malformed profiles were reported as unsupported media; worker-profile and parameter failures now return `PROCESSING_FAILED` with an effects/settings action, while actual media failures retain `UNSUPPORTED_MEDIA`.
- `maybe-false` — `features/final/final-worker-utils.ts`: the pre-existing bounded WAV header scan returns at the first `fmt ` chunk; whether a conflicting later format chunk can be accepted by the bundled FFmpeg decoder was not demonstrated. A malformed duplicate/inconsistent-`fmt ` WAV fixture and worker test would settle this; tracked separately pending evidence.
- `patch` — `shared/contracts/final-job.ts`: intensity zero is in the clarity contract but was rejected for every enabled stage; zero-gain clarity is now allowed alongside an effective noise stage, while clarity-only zero-gain remains non-runnable with an actionable message.
- `patch` — `features/final/final-worker.ts`: a missing or malformed worker stage payload could throw before a structured failure; the worker now validates the payload before reading stage fields and safely rejects invalid requests with a job ID.
- `patch` — `shared/contracts/final-job.ts`: a clarity-only profile at zero intensity could be queued despite producing no change; the final-profile predicate now requires at least one effective stage.
- `patch` — `tests/e2e/preview-formats.pw.ts`, `tests/e2e/final-output.pw.ts`: combined integration tests only checked that both stages ran, not order; both now assert observed denoise-before-clarity stage progress.

## Verification

**Commands:**
- `npm test` -- passed: 231 tests in 31 files.
- `npm run typecheck` -- passed.
- `npm run lint` -- passed.
- `npm run build` -- passed.
- `npm run test:e2e` -- passed: 32 browser tests, including clarity-only, combined ordering, no-model clarity path, artifact validation/download, and cancellation.
- `npm run verify:ffmpeg` -- passed: bundled local decode/range trim/resample/WAV validation and PCM24 WAV encoding.

**Manual checks:**
- [ ] Human listening on real speech and spoken screen-reader observations were not performed here. Try denoise-only, clarity-only, and combined settings on a local speech recording; compare intelligibility/artifacts, confirm cancellation and downloaded WAV playback, and record actual Narrator output separately. Do not treat automated assertions as spoken-output evidence.
