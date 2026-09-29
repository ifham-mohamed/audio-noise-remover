---
title: 'Story 3.2 — Show Preview Progress, Cancellation, and Failure'
type: 'feature'
created: '2026-09-29'
status: 'in-progress'
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

**Approach:** Add real local preview execution and coordinator-owned lifecycle reporting, then expose accessible progress, cancellation, failure, and linked retry controls. Claim readiness only after validating a real artifact; comparison controls remain Story 3.3.

**Approved scope:** Include Story 3.1’s deferred source access/worker together with lifecycle UI and coordinator controls. Never simulate production progress or success.

**Processing placement decision:** Use a same-origin browser worker that receives the selected `File` directly. The UI relays typed lifecycle messages to the server coordinator, which remains the sole job-state owner. Media bytes never pass through API/network requests.

## Boundaries & Constraints

**Always:** Validate typed boundary contracts; sequence progress per job; mark cancellation terminal only after worker stop and cleanup; expose no artifact on cancel/failure; retry as a new linked attempt; announce status accessibly; preserve the source; keep media bytes in the browser worker (never send them to an API/network); bundle runtimes for offline use; report unavailable model capability without choosing a model silently.

**Never:** Equate HTTP abort with processing cancellation; let UI/adapters mutate job state; allow late events to reverse terminal state; add cloud processing, final-job/history scope, or an unevaluated model family.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PROGRESS | Running job event | Show phase, determinate progress when available, elapsed time | Reject wrong-job, malformed, or regressive events |
| CANCEL/RACE | Cancel while queued/running, including completion race | Announce “Cancelling… finishing the current step”; settle once after stop and cleanup | Idempotent; no cancelled/failed artifact or late success |
| FAILURE/LIMIT | Stage error, unsupported codec, missing model, or resource exhaustion | Show safe cause and applicable retry/settings/diagnostics actions | Stable error; clean partial outputs; reveal no sensitive paths or media |
| RETRY | Failed/cancelled job | New ID linked to prior attempt; keep prior terminal job immutable | Reject retry for active/succeeded job |

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
- [ ] `features/preview/*` -- local `File` handoff and cancellation plumbing exist, but there is no TypeScript model adapter, licensed bundled FFmpeg wasm core, enabled-stage adapter coverage, or validated playable artifact path; real preview success is not implemented.
- [x] `server/domain/preview-coordinator.ts`, `app/api/preview-jobs/route.ts` -- own state transitions, sequenced event validation, failure and linked retry attempts.
- [x] `features/editor/preview-action.tsx`, `preview-surface.tsx` -- show per-job phase/progress/elapsed, cancel, safe failure actions, and retry accessibly.
- [ ] Preview tests -- contract transitions, regressions, terminal race rejection, and retry linkage are covered; worker artifact cleanup, processing of supported formats, and full screen-reader flow remain unverified.

**Acceptance Criteria:**
- Given a job is running, when its valid events arrive, then only that job shows its phase, available progress, and elapsed time.
- Given a user cancels, when the worker stops and cleans up, then the UI announces cancelling until the coordinator records cancelled with no artifact.
- Given execution fails or a runtime/model is unavailable, when the coordinator records failure, then safe error details and applicable retry/settings/diagnostics actions appear; no artifact is exposed.
- Given a job is failed or cancelled, when retried, then a new linked ID is created and the previous terminal attempt is unchanged.
- Given events are late, regressive, malformed, or for another job, when consumed, then they cannot mutate a terminal or unrelated job.
- Given the worker validates a real artifact, when the job succeeds, then “Preview ready” is announced and the artifact is available to Story 3.3 without final-output language.

## Implementation Notes

- Added typed queued/running/cancelling/cancelled/failed/succeeded preview lifecycle contracts, ordered per-job events, artifact/failure invariants, retry linkage, coordinator-owned state, and metadata-only job routes. The coordinator rejects wrong-job, out-of-order, regressive, and late terminal events.
- Added a browser worker that receives the selected `File` directly and relays typed events; API payloads contain only job/event metadata. The Apache-2.0 DPDFNet2 48 kHz candidate is downloaded explicitly and SHA-256 verified in local ignored storage, and `onnxruntime-web` is pinned as the intended CPU runtime. The custom, network-disabled LGPL FFmpeg browser core is now built and bundled locally with its license and corresponding source archives. The worker rejects files above 256 MiB before full-file buffering, maps the selected audio-stream ordinal, extracts the requested range to canonical 48 kHz float WAV, validates its RIFF/WAVE structure, and cleans temporary in-memory files; FFmpeg termination is unconditional, including load failure, and editor unmount requests cancellation. It still deliberately reports capability unavailability: DPDFNet missed the 100-clip VoiceBank+DEMAND STOI gate (+0.0097 versus +0.03 required) and its stateful model-specific preprocessing/inference/postprocessing adapter is not implemented; enabled voice-clarity/loudness/echo stages lack qualified adapters; and there is no playable artifact handoff/validation path. It never reports success or exposes decoded-but-unprocessed audio as enhanced.
- Added progress/elapsed/cancellation/failure UI, safe settings/diagnostics links, and coordinator-created linked retries. Failed and cancelled jobs cannot include an artifact.
- Fixed worker event numbering so failures after progress retain a strictly increasing sequence; previously a read exception after the initial progress event emitted sequence 1 again and could leave the coordinator in `running`.
- Added worker-client tests for same-origin module-worker handoff, ordered event delivery, malformed/wrong-job/out-of-order event rejection, cancellation settlement, worker construction failure, and worker crash after progress. Added selected-stream command mapping, oversized-input boundary, editor-unmount cancellation, and UI accessibility assertions for progress/elapsed announcements, cancelling, failure actions, cancellation, and artifact absence.
- Docker Desktop's Linux engine became available and the custom LGPL build completed; its configure summary reported LGPL 2.1-or-later with network support disabled. The reduced build enables no GPL/nonfree components. The browser core is FFmpeg 5.1.4 because of the pinned upstream ffmpeg.wasm bindings, while the architecture separately names a locally provisioned FFmpeg 9.0.2 binary. This runtime version split is documented in `docs/ffmpeg-runtime.md` and must be resolved before broader compatibility claims.
- The `verify:ffmpeg` integration check exercises the checked-in WASM core against a generated one-second WAV and confirms local range extraction, 48 kHz stereo float conversion, a valid 0.500-second WAV, and temporary-file cleanup. It does not yet exercise MP3/FLAC/M4A or video containers in the browser worker. The worker does not publish the decoded test output as enhanced. Model qualification/adapter, enabled-stage coverage, a browser-retained validated playable artifact, broader format/video tests, and full manual assistive-technology checks remain story-blocking; Story 3.2 must stay in progress, and Story 3.3 must not start yet.

## Spec Change Log

## Review Triage Log

- `patch` — `features/preview/preview-worker.ts`: unbounded whole-file buffering could exhaust tab memory; a 256 MiB bound now fails before `arrayBuffer()`, with boundary tests for accepted and rejected sizes.
- `patch` — `features/preview/preview-worker.ts`: a failed FFmpeg load could leave its nested worker alive; cleanup now always calls `terminate()`, including when `loaded` is false.
- `patch` — `features/editor/preview-action.tsx`: navigating away could leave local work running; component cleanup now requests worker cancellation and a component test verifies it.
- `patch` — `features/preview/preview-worker.ts`: decode always selected `0:a:0`; the job's selected audio stream is resolved to its audio ordinal and the command-builder test verifies a non-first track maps to `0:a:1`.

## Design Notes

Keep cancellation distinct from cancellation completion and associate retry with its failed attempt. Approved placement is a same-origin browser worker receiving `File`; the UI relays typed events and the server coordinator alone writes state. FFmpeg.wasm documents worker-based media processing ([overview](https://ffmpegwasm.netlify.app/docs/overview/)); ONNX Runtime Web documents browser WASM CPU support ([matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)). The docs do not guarantee codec coverage/performance, so test formats and resource failures. No model adapter/manifest exists; keep family selection open and report missing capability.

## Verification

**Commands:**
- `npm test -- --pool=forks --maxWorkers=1` -- passed: 17 files, 88 tests, including preview contract, route, worker-client, worker utilities, and UI tests.
- `npm run typecheck` -- passed.
- `npm run lint` -- passed.
- `npm run model:setup` -- passed; the pinned local model checksum was re-verified and the ignored local manifest regenerated.
- `npm run verify:ffmpeg` -- passed: the checked-in custom LGPL WASM decoded a generated WAV, trimmed a range, resampled to canonical PCM, validated a 0.500-second WAV, and cleaned temporary in-memory files.
- `npm run build` -- passed after bundling the worker and local runtime assets.
- `npm audit` -- passed with zero known vulnerabilities after removing the temporary ONNX metadata parser dependency and upgrading Vitest.

**Manual checks:**
- Component tests verify keyboard activation, live announcements for progress/cancelling/cancelled/failed, retry/settings actions, and absence of artifacts for cancelled/failed states. Full assistive-technology/manual browser checks, browser-worker processing against real media files, and a playable ready-state flow remain unverified because there is no qualified enhancement adapter or validated artifact handoff yet.
