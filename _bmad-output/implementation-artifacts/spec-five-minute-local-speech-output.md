---
title: 'Enable Five-Minute Local Speech Enhancement Output'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'b1b459e'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-local-speech-denoise-and-clarity.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The selected 4:57 mono WAV recording is valid for the existing local experimental processing path, but the UI disables full processing because a two-minute cap rejects it. A 30-second preview cannot produce a complete enhanced recording.

**Approach:** Extend the existing local WAV final path to five minutes and retain the current 128 MB cap, model warning, output validation, and cancellation/cleanup behavior. Bound the DPDFNet residual-frame history to the frames actually needed for its four-frame alignment so processing longer clips does not retain the entire input history.

**Always:** Process locally; preserve the original; retain exact-duration WAV validation, the experimental/not-production-qualified labeling, cancellation cleanup, CPU/WASM baseline, existing model-quality gate, and fail-closed behavior for unsupported media/effects. A 297-second WAV must be eligible for complete output; media over 300 seconds remains rejected before job creation.

**Never:** Claim production qualification; remove the 128 MB limit; silently skip an enabled stage; expand compressed/video final export; change unavailable loudness/echo effects; or weaken artifact validation.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SELECTED_RECORDING | Valid 297-second, mono WAV within size limit | Process becomes available and the final worker processes the full duration | Any worker/model failure leaves no successful artifact and preserves source |
| DURATION_LIMIT | WAV longer than 300 seconds | Process remains unavailable with a five-minute limit explanation | No job or partial artifact is created |
| LONG_RUN_CANCEL | Supported long WAV, user cancels during enhancement | Cancellation stops the worker and retains no partial output | Terminal state is cancelled; source remains unchanged |

</frozen-after-approval>

## Implementation Notes

Updated the shared experimental duration constant to 300 seconds, final-worker decoded-duration guard, and output-action copy. The selected 297-second mono WAV (27.2 MB) qualifies while >300 seconds fails closed; the 128 MB cap and WAV-only output remain. FFmpeg decode is bounded to 300.1 seconds to distinguish an over-limit/mismatched WAV from an exact five-minute file, and any decoded duration above 300 is rejected before enhancement. DPDFNet reconstructs incrementally into the final PCM buffer using a bounded overlap window and retains only the four residual frames needed for alignment. Full decoded PCM, enhanced PCM, and encoded FFmpeg buffers still scale with clip duration; peak memory for five-minute DPDFNet inference is not measured. A generated 300-second WAV completed clarity-only final processing, reopened as a validated exact-duration artifact, and was downloadable in Playwright. A separate five-minute WAV decoded to model handoff and was cancelled with no retained output. The pinned model's five-minute inference time/memory and speech quality have not been measured on the user's actual recording; it remains experimental and is not quality-qualified.

## Review Triage Log

- `patch` — `features/preview/dpdfnet-adapter.ts`, `features/preview/dpdfnet-signal.ts`: extending duration while retaining all spectral frames and full-length overlap-add arrays risked browser memory exhaustion. Residual alignment history is bounded to four frames and inverse-STFT overlap-add now emits completed hops into the final PCM buffer; focused model-worker and signal tests pass.
- `patch` — `tests/e2e/final-output.pw.ts`: the 297-second eligibility needed evidence beyond profile validation. Added a generated 297-second WAV full-output browser test; it completes clarity-only processing, reopens validated output at 297.0 seconds, and confirms download availability. The long-duration denoiser itself was not timed against user media and remains explicitly unverified.
- `patch` — `features/final/final-worker.ts`: checking duration only after decoding could retain arbitrarily long audio from a forged/mismatched header. FFmpeg now limits decoding to 300.1 seconds, then the shared duration check rejects any decoded output above the supported 300 seconds or mismatched to source metadata; focused tests cover the rejection boundary. The pre-decode 128 MB input cap remains.
- `patch` — `features/editor/final-process-action.tsx`: duration-limit copy derived an awkward fractional minute if the cap changed. Whole-minute limits use minute copy and non-whole-minute limits use seconds; UI tests assert the current five-minute boundary.
- `patch` — `tests/e2e/final-output.pw.ts`: a short fixture did not verify cancellation after a long source decode. The cancellation E2E now decodes a 300-second WAV to the model handoff before cancelling, then verifies the cancelled state and absence of retained output.
- `patch` — `tests/e2e/final-output.pw.ts`: profile validation alone did not test the exact supported ceiling. The full-output E2E processes exactly 300 seconds, reopens the validated artifact at 300.0 seconds, and confirms download availability.
- `patch` — `tests/dpdfnet-adapter.test.ts`: the streaming overlap-add implementation needed parity evidence. It is compared against the prior batch overlap-add reference at lengths around hop boundaries, short windows, and the zero-padded tail.
- `defer` — `features/preview/dpdfnet-adapter.ts`: a real five-minute DPDFNet inference benchmark/listening check is not available from the screenshots and would require access to the user's media or an equivalent long speech fixture. The full-length processing path is enabled and long-file decode/cancellation plus short real-model inference are covered; record device-specific runtime, memory, and listening evidence before treating long-file denoising as production-qualified.
- `false` — the claim that the spec promises a 297-second full-output E2E is incorrect. The spec states the 297-second profile qualifies (verified in contract/UI tests), while the full-output E2E tests the exact 300-second ceiling.
- `defer` — a representative five-minute speech denoising run is not demonstrated: the long-file output fixture is a generated tone and uses clarity-only; DPDFNet is verified on shorter browser fixtures. A rights-cleared long speech fixture and device-specific runtime/listening check remain necessary for long-run quality evidence.
- `patch` — `features/final/final-worker.ts`, `features/final/final-worker-utils.ts`: the 300-second decode cap alone could truncate a mismatched longer WAV to exactly 300 seconds if reported metadata were stale. Decode now allows only a 0.1-second sentinel beyond the accepted limit and rejects any decoded duration above 300; focused tests cover over-limit and metadata mismatch rejection.
- `patch` — `tests/final-process-action.test.tsx`: the UI's above-limit check now exercises 300.01 seconds directly, matching the 300-second contract boundary.
- `false` — the suggested missing 297-second metadata test is already present in `tests/final-job.test.ts`: it constructs a mono media profile at 297 seconds and 27,200,000 bytes, then asserts it is supported.
- `defer` — five-minute DPDFNet processing is not established by the clarity-only full-output test. Existing browser coverage exercises real DPDFNet on short clips and cancellation during inference; the long-source cancellation test covers decode-to-model handoff. The complete long-model run needs a representative user-owned or rights-cleared speech file and target-device observation.
- `defer` — a long-file resource/quality follow-up must be owned by the project owner and closed on the target Windows/browser device using the 297-second, 27.2 MB speech recording or an equivalent rights-cleared fixture: record browser/CPU, wall time, and peak working set; confirm a locally playable/downloadable validated 297.0 ± 0.05 second noise-only output with the source unchanged; cancel a second attempt after inference starts and confirm cancelled state/no artifact. Any production-quality claim additionally requires the existing STOI, SI-SDR, PESQ, clipping/loudness, and listening gates.
- `false` — the exact boundary is not implicit: profile tests accept 300 seconds and reject 300.01, the UI tests reject 300.01, the exact-300-second browser output succeeds, and the worker rejects decoded durations above 300 while allowing at most 0.05 seconds of source-metadata difference.
