---
title: 'Story 3.2 — Show Preview Progress, Cancellation, and Failure'
type: 'feature'
created: '2026-09-29'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '33e9ea7be6c0836ae0e147dfb80f42faadc7b657'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.1 creates only a prepared request, so users cannot see real execution, safely cancel it, understand failures, or retry.

**Approach:** Add real local preview execution and coordinator-owned lifecycle reporting, then expose accessible progress, cancellation, failure, and linked retry controls. Claim preview readiness only after actual enhancement and validation of a real artifact; comparison controls remain Story 3.3. Label output from an unqualified model experimental.

**Approved scope:** Include Story 3.1’s deferred source access/worker together with lifecycle UI and coordinator controls. The user explicitly approved an experimental, local-only preview using the pinned DPDFNet2 48 kHz candidate despite its failed production quality gate. Such a preview may succeed as an experimental job after actual model inference and artifact validation, but cannot be described as a qualified production enhancement. Preserve the independent evaluation and PESQ gates for any later production claim. Never simulate model work or present decoded source audio as enhanced.

**Processing placement decision:** Use a same-origin browser worker that receives the selected `File` directly. The UI relays typed lifecycle messages to the server coordinator, which remains the sole job-state owner. Media bytes never pass through API/network requests.

## Boundaries & Constraints

**Always:** Validate typed boundary contracts; sequence progress per job; mark cancellation terminal only after worker stop and cleanup; expose no artifact on cancel/failure; retry as a new linked attempt; announce status accessibly; preserve the source; keep media bytes in the browser worker (never send them to an API/network); bundle runtimes for offline use; load only the explicitly pinned and checksum-verified local model. Process only stages with implemented adapters, and fail visibly without an artifact if an enabled stage lacks one. Make experimental status visible and accessible on the control and result.

**Never:** Equate HTTP abort with processing cancellation; let UI/adapters mutate job state; allow late events to reverse terminal state; add cloud processing, final-job/history scope, or another unevaluated model family; hide an unsupported enabled effect, claim model qualification, or present decoded source audio as enhanced.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PROGRESS | Running job event | Show phase, determinate progress when available, elapsed time | Reject wrong-job, malformed, or regressive events |
| CANCEL/RACE | Cancel while queued/running, including completion race | Announce “Cancelling… finishing the current step”; settle once after stop and cleanup | Idempotent; no cancelled/failed artifact or late success |
| FAILURE/LIMIT | Stage error, unsupported codec, missing model, or resource exhaustion | Show safe cause and applicable retry/settings/diagnostics actions | Stable error; clean partial outputs; reveal no sensitive paths or media |
| RETRY | Failed/cancelled job | New ID linked to prior attempt; keep prior terminal job immutable | Reject retry for active/succeeded job |
| EXPERIMENTAL PREVIEW | Pinned DPDFNet2 available; noise removal enabled; all stages without adapters disabled | Run real local inference, validate and retain the enhanced WAV, announce an experimental preview ready for Story 3.3 | Missing model, invalid output, or any unsupported enabled stage fails with no artifact; cancellation releases model/runtime resources |

</frozen-after-approval>

## Code Map

- `shared/contracts/preview.ts` -- extend `prepared` into typed progress/terminal states, sequenced events, artifact rules, cancellation, and retry linkage.
- `server/domain/preview-coordinator.ts`, `app/api/preview-jobs/route.ts` -- coordinator owns all transitions; APIs receive metadata/events only, never media bytes.
- `features/intake/intake-panel.tsx`, `features/preview/preview-worker.ts` (new), `preview-worker-client.ts` (new) -- pass selected `File` only to worker; relay typed events and cleanup; keep FFmpeg/model imports out of React UI.
- `features/editor/preview-action.tsx`, `preview-surface.tsx` -- render job-specific progress, elapsed time, cancellation/failure and retry actions with accessible announcements.
- `package.json`, `package-lock.json` -- include locally hosted worker runtimes/assets only; no CDN/runtime network dependency.
- `tests/preview.test.ts`, `preview-route.test.ts`, `preview-action.test.tsx`, worker tests -- cover transitions, races, isolation, cleanup, retry and accessibility; exercise supported media/video adapters.
- `deferred-work.md` -- record whether this work fully closes Story 3.1’s worker/source-access deferral.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/preview.ts` -- define sequenced lifecycle events, terminal result/artifact invariants, cancellation and retry linkage.
- [x] `package.json`, `package-lock.json`, `models/`, and setup documentation -- pin ONNX Runtime Web CPU, add an explicit downloader for the Apache-2.0 DPDFNet2 48 kHz candidate, verify its publisher SHA-256, and record its experimental/non-production status. The model file/manifest are local ignored artifacts and are not committed.
- [x] `features/preview/*` -- the pinned DPDFNet2 48 kHz browser CPU adapter performs preprocessing, stateful inference, postprocessing, cancellation, and cleanup; a noise-removal-only experimental profile produces validated enhanced WAV. Other enabled stages fail visibly without an artifact.
- [x] `server/domain/preview-coordinator.ts`, `app/api/preview-jobs/route.ts` -- own state transitions, sequenced event validation, failure and linked retry attempts.
- [x] `features/editor/preview-action.tsx`, `preview-surface.tsx` -- show per-job phase/progress/elapsed, cancel, safe failure actions, and retry accessibly.
- [x] Preview tests -- contract transitions, regressions, terminal race rejection, retry linkage, artifact cleanup, all seven supported worker input formats, and selected video audio-track mapping are covered by passing unit and real-browser tests. Automated keyboard activation and live-status assertions cover the app flow.
- [x] Manual failure-path assistive-technology check -- the user reports completing the Edge/Narrator failure-path walkthrough and that tested controls and announcements worked. Browser/reader versions and per-control notes were not recorded.
- [ ] Manual success/cancellation Narrator check -- automated browser tests verify live-region text, real experimental success, and inference-time cancellation, but no human-observed spoken announcement has been recorded for these new paths.

**Acceptance Criteria:**
- Given a job is running, when its valid events arrive, then only that job shows its phase, available progress, and elapsed time.
- Given a user cancels, when the worker stops and cleans up, then the UI announces cancelling until the coordinator records cancelled with no artifact.
- Given execution fails or a runtime/model is unavailable, when the coordinator records failure, then safe error details and applicable retry/settings/diagnostics actions appear; no artifact is exposed.
- Given a job is failed or cancelled, when retried, then a new linked ID is created and the previous terminal attempt is unchanged.
- Given events are late, regressive, malformed, or for another job, when consumed, then they cannot mutate a terminal or unrelated job.
- Given the pinned experimental model is installed and only supported stages are enabled, when the worker performs real inference and validates enhanced audio, then an explicitly experimental “Preview ready” is announced and the artifact is available to Story 3.3 without final-output or production-quality language.
- Given an enabled stage lacks an adapter or the model is absent, when preview runs, then it fails with a specific safe explanation and publishes no artifact.

## Implementation Notes

The entries below document implementation history, including the former pre-experimental `MODEL_UNAVAILABLE` state. Current verified behavior is recorded in **Experimental-path completion (2026-09-30)** below and supersedes those former-state statements.

- Added typed queued/running/cancelling/cancelled/failed/succeeded preview lifecycle contracts, ordered per-job events, artifact/failure invariants, retry linkage, coordinator-owned state, and metadata-only job routes. The coordinator rejects wrong-job, out-of-order, regressive, and late terminal events.
- Added a browser worker that receives the selected `File` directly and relays typed events; API payloads contain only job/event metadata. The Apache-2.0 DPDFNet2 48 kHz candidate is downloaded explicitly and SHA-256 verified in local ignored storage, and `onnxruntime-web` is pinned as the intended CPU runtime. The custom, network-disabled LGPL FFmpeg browser core is now built and bundled locally with its license and corresponding source archives. The worker rejects files above 256 MiB before full-file buffering, maps the selected audio-stream ordinal, extracts the requested range to canonical 48 kHz float WAV, validates its RIFF/WAVE structure, and cleans temporary in-memory files; FFmpeg termination is unconditional, including load failure, and editor unmount requests cancellation. A browser-local validated artifact store/handoff now exists, but the worker still deliberately reports capability unavailability: DPDFNet missed the 100-clip VoiceBank+DEMAND STOI gate (+0.0097 versus +0.03 required) and its stateful model-specific preprocessing/inference/postprocessing adapter is not implemented; enabled voice-clarity/loudness/echo stages lack qualified adapters. It never reports success or exposes decoded-but-unprocessed audio as enhanced.
- Added progress/elapsed/cancellation/failure UI, safe settings/diagnostics links, and coordinator-created linked retries. Failed and cancelled jobs cannot include an artifact.
- Review fixes prevent duplicate active attempts, settle a coordinator job when worker startup messaging throws, report resource exhaustion safely, remove expired artifacts on lookup, scan valid WAV chunks beyond large metadata payloads, and reject sequence gaps except for cancellation-discarded progress. A user-click cancellation test now exercises the UI-to-coordinator-to-worker terminal path.
- Screened the publisher's higher-capacity DPDFNet8 48 kHz graph against the same 100 VoiceBank+DEMAND paired filenames at the existing 12 dB attenuation setting. It also misses the noisy-speech STOI gate (median +0.0078; 20/100 clips at or above +0.03) and has a median CPU RTF of 0.811; it remains unselected. This does not resolve the production-model blocker. Full details and artifact provenance are in `speech-model-bakeoff.md`.
- Fixed worker event numbering so failures after progress retain a strictly increasing sequence; previously a read exception after the initial progress event emitted sequence 1 again and could leave the coordinator in `running`.
- Cancellation now requests the browser worker to stop as soon as the user clicks or leaves the editor, while a terminal `cancelled` event waits for the coordinator's cancel command to finish. In-flight progress after the stop request is discarded; the coordinator's existing cancellation-only sequence-gap rule allows the cleanup-complete terminal event to settle. Focused regression tests cover delayed coordinator response and progress arriving after cancellation.
- Added worker-client tests for same-origin module-worker handoff, ordered event delivery, malformed/wrong-job/out-of-order event rejection, cancellation settlement, worker construction failure, and worker crash after progress. Added selected-stream command mapping, oversized-input boundary, editor-unmount cancellation, and UI accessibility assertions for progress/elapsed announcements, cancelling, failure actions, cancellation, and artifact absence.
- Added a browser-local IndexedDB preview artifact store for validated enhanced WAV bytes (48 kHz mono/stereo PCM16/24/32 or float32, bounded to 64 MiB), seven-day pruning, revalidation on read, and a revocable playable object URL. The worker client requires `enhancement-adapter` provenance and actual WAV bytes, stores and validates them before relaying success metadata to the coordinator, removes retained data if the coordinator rejects success, and converts missing/invalid/unretainable artifact handoffs into failure. Only the artifact ID/metadata is relayed; audio bytes never enter the API. Story 3.3 can resolve a successful artifact by ID with `openPreviewArtifact()`. The worker currently has no qualified enhancement adapter and therefore still emits `MODEL_UNAVAILABLE`; this handoff is intentionally not fed decoded source audio and cannot yet produce a successful user preview.
- Added `npm run test:e2e`, which builds the app and runs the actual browser worker and bundled LGPL FFmpeg wasm in Microsoft Edge against generated, local-only fixtures for WAV, MP3, FLAC, M4A, MP4, MOV, and MKV. Every supported fixture must complete demux/decode and reach the expected `MODEL_UNAVAILABLE` guard; malformed/unsupported decode outcomes fail the tests. A two-audio-track MKV fixture uses unsupported AC-3 as track 0 and supported AAC as track 1; the browser test proves track 0 fails and selecting track 1 decodes. Requests are checked to remain same-origin. A production-app keyboard test activates file selection and Preview with Enter, verifies the accessible live failure announcement and settings action, and confirms only metadata—not file/audio bytes—reaches the API. These are automated browser accessibility checks, not a manual screen-reader session.
- Docker Desktop's Linux engine became available and the custom LGPL build completed; its configure summary reported LGPL 2.1-or-later with network support disabled. The reduced build enables no GPL/nonfree components. The browser core is FFmpeg 5.1.4 because of the pinned upstream ffmpeg.wasm bindings, while the architecture separately names a locally provisioned FFmpeg 9.0.2 binary. This runtime version split is documented in `docs/ffmpeg-runtime.md` and must be resolved before broader compatibility claims.
- The `verify:ffmpeg` integration check exercises the checked-in WASM core against a generated one-second WAV and confirms local range extraction, 48 kHz stereo float conversion, a valid 0.500-second WAV, and temporary-file cleanup. `npm run test:e2e` additionally exercises the actual browser worker/core for WAV, MP3, FLAC, M4A, MP4, MOV, MKV, and a selected non-first video audio stream. Automated checks also cover browser-local artifact validation, retention, reopening, URL release, seven-day pruning, success-before-coordinator ordering, cleanup on coordinator rejection/storage failure, and rejection of success without enhanced-byte provenance. No production worker execution has yet yielded an enhanced artifact because model qualification/adapter and enabled-stage coverage remain missing. The app’s keyboard activation and live-region path passed in Edge, but manual Narrator/VoiceOver/NVDA announcement checks remain outstanding; the machine had no screen reader running and native screen-reader controls are unavailable in this session. Story 3.2 stays in progress, and Story 3.3 must not start until a qualified adapter produces a real enhanced artifact and the end-to-end handoff is exercised.

The server coordinator now persists schema-validated preview metadata in an atomic local JSON store under the user's home application-data folder; `AI_NOICE_PREVIEW_JOB_STORE_PATH` isolates tests. It retains terminal history until explicit clearing, reconciles interrupted work at startup (running/queued to retryable failure; cancelling to cancelled), and never stores media bytes. Restart recovery, retry linkage, corruption handling, and retention beyond 50 attempts have regression coverage.

### Experimental-path completion (2026-09-30)

- The worker now loads the locally installed, SHA-256-pinned DPDFNet2 48 kHz ONNX graph through same-origin `/api/preview-model`, executes stateful CPU/WASM inference, and checks the output for finiteness, non-silence, clipping, changed samples, duration, and size. Model bytes never leave the local app; media bytes remain in the browser worker. Only noise removal can run experimentally; any other enabled stage fails clearly without an artifact.
- FFmpeg decodes the selected stream to 48 kHz mono float PCM for this mono model, preventing a mono-to-stereo-to-mono level loss. Centered STFT, Vorbis window, attenuation blend, ISTFT, and zero-padded latency tail match the publisher-reference synthetic fixture with browser output RMSE below `1e-5`. FFmpeg encodes the enhanced WAV; IndexedDB validates/retains it before coordinator success, and Story 3.3 can reopen it by artifact ID. Decoded source PCM is never used as the enhanced artifact.
- Actual app and worker Edge tests cover success labeling, seven supported containers, selected non-first MKV audio stream, enhanced artifact reopening, unsupported-stage/missing-model failure, and inference-time cancellation with no retained artifact. Decode-progress events are unsubscribed before enhanced encoding so late FFmpeg progress cannot regress the coordinator sequence.
- A bounded private 100-pair EARS + WHAM diagnostic across six speakers measured median STOI gain `+0.05034` and median SI-SDR gain `+6.78 dB` on the pinned 12 dB profile. It is diagnostic only: VoiceBank+DEMAND remains below its STOI gate, source-level training overlap and PESQ clean-preservation are unresolved, and no model is production-qualified. The current preview is visibly and accessibly marked experimental.
- Human-observed Narrator speech for the newly available successful model progress and cancellation states remains unverified. The prior user-reported walkthrough covered the failure path only. This does not negate the automated text/live-region checks but should be completed before claiming full assistive-technology verification.

## Spec Change Log

- 2026-09-29: User explicitly approved an experimental local preview with an unqualified model as a way to advance the app while independent quality evidence remains pending. The frozen intent, matrix, task, and acceptance language above were updated to allow a real, visibly experimental DPDFNet2 result; production qualification gates remain separate.

## Review Triage Log

- `patch` — Blind Hunter B1, `features/editor/preview-action.tsx`: queued/running previews could be started again, replacing the active worker reference. The control and handler now prevent overlapping attempts; a regression test verifies only one request is created.
- `patch` — Blind Hunter B2, `features/preview/preview-worker-client.ts`: a `postMessage` startup exception could strand a queued job. It now becomes a sequenced terminal runtime failure and terminates the worker; a regression test covers `DataCloneError`.
- `patch` — Blind Hunter B3, `server/domain/preview-coordinator.ts`: attempts now use a schema-validated local file store with atomic replacement; startup reconciles running jobs to retryable failure and cancelling jobs to cancelled. Restart/retry and terminal-history retention are covered in `tests/preview-job-store.test.ts`.
- `false` — Blind Hunter B4, `server/domain/preview-coordinator.ts`: capability checks are intentionally not a gate to queueing. `tests/preview.test.ts` verifies unavailable FFmpeg still creates an attempt so a stable terminal runtime failure can be recorded; model unavailability is likewise surfaced by the worker.
- `patch` — Blind Hunter B5, `features/preview/preview-worker.ts`: allocation/resource failures now map to `RESOURCE_EXHAUSTED` with safe user guidance; input still has an explicit 256 MiB pre-buffer cap. Unit coverage checks memory/quota classification.
- `patch` — Blind Hunter B6, `features/preview/preview-artifact-store.ts`: opening an expired artifact now deletes its IndexedDB record before returning unavailable; a test checks it cannot be reopened.
- `patch` — Blind Hunter B7, `features/preview/preview-artifact-store.ts`: WAV validation now walks chunk headers by offset rather than truncating inspection at 1 MiB; a valid WAV with a >1 MiB metadata chunk is covered.
- `false` — Blind Hunter B8, `features/editor/preview-surface.tsx`: playback/comparison controls are explicitly assigned to Story 3.3 in the frozen intent. Story 3.2 exposes only a validated artifact handoff and must not imply final-output success.
- `defer` — Blind Hunter B9, `spec-3-2`: no qualified production model/adapter exists; both screened candidates missed the required STOI gate and enabled-stage adapters remain absent. This is an explicit qualification gate, not safe to substitute with decoded source audio. See deferred-work record below.
- `defer` — Blind Hunter B10, `spec-3-2`: a real screen-reader announcement/navigation session remains outstanding. Browser automation does not establish spoken output; the manual checklist remains unchecked pending an active reader and human observation.
- `false` — Edge Case Hunter E1, `server/domain/preview-coordinator.ts`: although a caller controlling the same local browser can fabricate an API event, this is outside the supported single-user local-product flow. The product UI gates success on validated and retained enhanced bytes before relaying metadata; the server cannot read browser IndexedDB without violating the approved no-media-bytes API boundary.
- `patch` — Edge Case Hunter E2, `server/domain/preview-coordinator.ts`: sequence gaps are now rejected except when cancellation discarded in-flight progress and the worker reports its terminal `cancelled` event. Tests cover normal gap rejection and cancellation settlement.
- `patch` — Edge Case Hunter E3, `server/domain/preview-coordinator.ts`: the duplicate ordering claim is covered by the same sequence-gap fix and coordinator regression tests; this is recorded separately because it was a separately reported finding.
- `patch` — Verification Gap, `tests/preview-action.test.tsx`: added coverage for clicking Cancel preview, sending the coordinator cancel command, receiving worker cancellation settlement, and showing a terminal cancelled job without a playable artifact.
- `patch` — `app/globals.css`: focus indicators based on box shadows could disappear when Windows forced-colors mode suppresses author shadows; a system-color outline now remains visible and is verified in Microsoft Edge forced-colors emulation.
- `patch` — `features/preview/preview-worker.ts`: unbounded whole-file buffering could exhaust tab memory; a 256 MiB bound now fails before `arrayBuffer()`, with boundary tests for accepted and rejected sizes.
- `patch` — `features/preview/preview-worker.ts`: a failed FFmpeg load could leave its nested worker alive; cleanup now always calls `terminate()`, including when `loaded` is false.
- `patch` — `features/editor/preview-action.tsx`: navigating away could leave local work running; component cleanup now requests worker cancellation and a component test verifies it.
- `patch` — `features/preview/preview-worker.ts`: decode always selected `0:a:0`; the job's selected audio stream is resolved to its audio ordinal and the command-builder test verifies a non-first track maps to `0:a:1`.


## Design Notes

Forced-colors verification exposed that the standard theme ring relies on box shadow and can disappear in Windows high-contrast mode. `app/globals.css` now adds a system-color outline on `:focus-visible` in forced-colors mode; Microsoft Edge emulation confirms it remains visible.

Keep cancellation distinct from cancellation completion and associate retry with its failed attempt. Approved placement is a same-origin browser worker receiving `File`; the UI relays typed events and the server coordinator alone writes state. FFmpeg.wasm documents worker-based media processing ([overview](https://ffmpegwasm.netlify.app/docs/overview/)); ONNX Runtime Web documents browser WASM CPU support ([matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)). The checked-in DPDFNet2 adapter is experimental, not a production model-family selection; report missing or invalid local capability truthfully.

## Verification

**Commands:**
- `npm test` -- passed: 20 files, 113 tests, including preview contract, route, worker-client, worker utilities, artifact storage, durable job-store recovery, UI, and DPDFNet signal tests.
- `npm run typecheck` -- passed.
- `npm run lint` -- passed.
- `npx vitest run tests/preview-action.test.tsx tests/preview-worker-client.test.ts --pool=forks --maxWorkers=1` -- passed: 20 tests, including immediate local stop and delayed coordinator cancellation ordering.
- `npm run test:e2e` -- passed: production build and 15 Microsoft Edge browser tests, including app experimental success announcement, real model/reference parity, supported audio/video containers, second audio-track selection, enhanced artifact reopening, inference-time cancellation with zero retained artifacts, accessible failure text, and reduced-motion/forced-colors focus.
- `npm run model:setup` -- passed; the pinned local model checksum was re-verified and the ignored local manifest regenerated.
- `npm run verify:ffmpeg` -- passed: the checked-in custom LGPL WASM decoded a generated WAV, trimmed a range, resampled to canonical PCM, validated a 0.500-second WAV, and cleaned temporary in-memory files.
- `npm run build` -- passed after bundling the worker and local runtime assets.
- `npm audit` -- passed with zero known vulnerabilities after removing the temporary ONNX metadata parser dependency and upgrading Vitest.

**Manual checks:**
- Automated component and browser tests verify keyboard activation, visible focus, status/live-region text, safe actions, forced-colors visibility, reduced motion, and no artifact for cancellation/failure. Automated text checks do not prove spoken screen-reader output.
- The user reported that the earlier Edge/Narrator failure-path walkthrough worked; versions and per-control notes were not supplied. The newly enabled successful experimental preview and inference-time cancellation need a fresh human-observed Narrator walkthrough. Record what was actually spoken for progress, ready, cancelling, cancelled, and retry; mark any unavailable scenario not tested.
