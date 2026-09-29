---
title: 'Story 4.1 — Start and Monitor Final Processing'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b6599aeae3e850943fcf56d3d52150f07f347606'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-4-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The application can create and monitor bounded preview jobs, but it has no distinct final-processing job flow. Users cannot start a final attempt or reliably observe its authoritative state and active stage.

**Approach:** Introduce a typed, persistent final-job lifecycle and connect the editor’s Process action to it without sending media bytes through the API. Show truthful job state, stage, elapsed time, and determinate progress when available; leave execution, output validation, cancellation, retry, and retrieval to their respective Epic 4 stories. Human approval on 2026-09-30 permits a future experimental, local-only final export explicitly labeled as experimental and not production-qualified, but only when the pinned local model, every enabled-stage adapter, and the complete final execution/output path are verified to run. This approval does not change or satisfy the production quality gate.

## Boundaries & Constraints

**Always:** Coordinator is the sole job-state writer; persist validated metadata atomically; use a distinct typed final-job identity; emit only monotonic job-matched events; keep media local to the browser worker; omit disabled stages; announce status accessibly; fail closed unless a concrete local final executor can verify the pinned experimental model, every enabled-stage adapter, and output path; label any such run experimental and not production-qualified; never fabricate processing progress or output success.

**Never:** Reuse preview success as final success; send media/audio/model data over APIs; present the experimental unqualified model as production-ready; expose output for failed/cancelled work; overwrite the source; implement cancellation/retry/output behavior in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CREATE | Valid inspected media and normalized profile | Persist a new immutable final job and return its ID/request ID without blocking for processing | Invalid profile or source target is rejected; no job is created |
| PROGRESS | Valid event for an active job | Persist the authoritative stage, elapsed time, and optional monotonic progress; announce in UI | Reject malformed, stale, regressive, or wrong-job event without changing state |
| UNAVAILABLE | Required production model/adapter is not qualified/available | Explain that final processing cannot start; never imply a preview is a final result | Stable safe `MODEL_UNAVAILABLE`/capability error; no output artifact |
| EXPERIMENTAL LOCAL EXPORT | Human-approved experiment, exact pinned model and every enabled-stage adapter plus final output path verified runnable | May proceed only with explicit experimental/not-production-qualified labeling | Missing model, enabled-stage adapter, or final executor fails closed; do not substitute preview output |

</frozen-after-approval>

## Code Map

- `shared/contracts/preview.ts` and `server/domain/preview-coordinator.ts` -- patterns for typed job state, Zod validation, single-writer transitions, persistence, and safe failure; do not conflate final and preview jobs.
- `server/adapters/preview-job-file-store.ts` -- local atomic file-store pattern; new final-job persistence must use its own schema and store.
- `app/api/preview-jobs/*` -- envelope/error handling patterns for metadata-only API boundaries.
- `features/editor/preview-action.tsx`, `features/editor/preview-surface.tsx`, and `components/app-shell.tsx` -- editor action, accessible status, and persistent active-job presentation patterns.
- `shared/contracts/processing.ts` -- validated media-aware normalized profile and explicit enabled stages; do not include disabled stages in active progress.
- `tests/preview.test.ts`, `tests/preview-route.test.ts`, and `tests/preview-action.test.tsx` -- persistence, route, transition, and accessible UI test conventions.

## Tasks & Acceptance

**Execution:**
- [x] Add shared final-job schemas for immutable metadata, typed ID, lifecycle, stage/progress, profile snapshot, timestamps, and safe terminal errors.
- [x] Add coordinator-owned local persistence, creation, retrieval, and ordered progress transitions with capacity and input validation.
- [x] Add metadata-only API endpoints using the standard `{ data, error, requestId }` envelope; reject media payloads and unsafe source destinations.
- [x] Add a Process action and accessible active-job view with stage, elapsed time, determinate progress when supplied, and shell return path. The action remains safely disabled until Story 4.2 provides the concrete full-file local executor.
- [x] Add focused tests for creation, persistence/reopen, invalid profiles, omitted disabled stages, event ordering/isolation, API envelopes, and keyboard/live status behavior.

**Acceptance Criteria:**
- Given valid media, profile, capabilities, and output settings, when Process is selected, then a new typed final job is persisted and returned without waiting for the full run.
- Given an active job receives valid events, when the UI refreshes or polls, then it shows only that job’s lifecycle, current enabled stage, elapsed time, and determinate progress when available.
- Given disabled stages exist in the profile, when the active-stage list is created, then those stages are omitted.
- Given an event is malformed, stale, regressive, or belongs to another job, when the coordinator receives it, then persisted state remains unchanged.
- Given production processing capability is unavailable, when the user attempts to process, then the UI gives an actionable safe error and exposes no successful output.
- Given media bytes are included in an API request, when the boundary validates it, then the request is rejected and the bytes are neither persisted nor logged.

## Implementation Notes

- Added a branded `FinalJobId`, strict metadata/profile/event/result-safe state contracts, an atomic local JSON metadata store, and a coordinator that owns creation and monotonic progress transitions. The server API rejects oversized requests, extra media-byte fields, invalid output targets, and stale/wrong-job events.
- Added the Process action, accessible final-job monitor, no-store status endpoints, and shell polling/link to the active job. Media bytes remain in the selected browser file; only validated metadata and progress cross the API.
- The user approved an experimental local final path, but the UI/API remain fail-closed until the full-file executor and validated output path exist; the current adapter is bounded preview only. Story 4.2 owns that execution path. No final processing success is simulated.
- Verification: 11 focused Story 4.1 tests pass; `npm run typecheck` and `npm run lint` pass. Browser-level final processing remains blocked on Story 4.2 integration.

## Spec Change Log

- 2026-09-30: Human approved experimental, local-only final exports with explicit experimental/not-production-qualified labeling. Process remains gated on verification of the pinned model, every enabled-stage adapter, and the complete final execution/output path. The production quality gate remains unmet and unchanged; no synthetic `final-processing` capability ID may be used as a readiness assertion.

## Review Triage Log

- **medium, defer —** Final worker dispatch and connecting the ready-gated Process control depend on the verified full-file executor and output path assigned to Story 4.2; the current app defaults safely unavailable and does not create a stranded queued job.
- **medium, patch —** `app/api/final-jobs/route.ts` classified `RUNTIME_UNAVAILABLE` as a 400 despite it being an unavailable local capability; map it to 503.
- **medium, patch —** `server/domain/final-job-coordinator.ts` could throw during module initialization when the persisted file was corrupt, before handlers could return safe envelopes; convert store initialization failure to a typed storage error.
- **medium, patch —** `server/domain/final-job-coordinator.ts` allowed lower progress after an event omitted progress and allowed stage jumps; preserve same-stage progress and require sequential enabled stages.
- **medium, patch —** `features/editor/final-job-view.tsx` and `components/app-shell.tsx` allowed overlapping polls to overwrite newer state; skip a poll while one is in flight.
- **medium, patch —** `features/editor/final-job-view.tsx` replaced a previously loaded job with a full error page after transient polling failure; preserve last-known state and announce refresh trouble separately.
- **medium, patch —** `app/api/final-jobs/[id]/route.ts` accepted an unbounded event body; enforce a small metadata-event limit before parsing.
- **medium, patch —** `shared/contracts/final-job.ts` allowed `succeeded` without validated output evidence and allowed a no-op profile; require validated output for success and at least one enabled stage at creation.
- **low, patch —** `features/editor/final-job-view.tsx` ignored failure action guidance and showed no numeric progress text; use the safe action target and visible/announced percentage.
- **low, patch —** `components/app-shell.tsx` omitted elapsed time from persistent active-job status; include the persisted elapsed time.
- **medium, patch —** `tests/final-job-view.test.tsx` did not verify a later progress poll; assert stage, elapsed time, percentage, and announcement.
- **medium, patch —** `tests/app-shell.test.tsx` did not verify fetching persisted active jobs; assert the returned job is linked from the shell.
- **medium, patch —** `server/domain/final-job-coordinator.ts` had no reservation across async capability checks, so concurrent creates could exceed the active-job cap; count pending creates.
- **medium, defer —** Startup reconciliation belongs to Story 4.4; its required work is recorded in `deferred-work.md` so persisted active attempts will not remain active after restart.

## Verification

**Commands:**
- `npm test -- --run tests/final-job.test.ts tests/final-job-route.test.ts tests/final-process-action.test.tsx tests/final-job-view.test.tsx` -- expected: all focused contract/coordinator/API/accessibility tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.

**Manual checks:**
- Use keyboard only to start and inspect a job; verify stage/status announcements and that the active-job link returns to the same attempt.
