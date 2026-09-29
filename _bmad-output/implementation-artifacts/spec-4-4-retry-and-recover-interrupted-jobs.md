---
title: 'Story 4.4 — Retry and Recover Interrupted Final Jobs'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6b79371'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-4-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
---

## Intent

Let users recover from a failed/cancelled final attempt and keep locally persisted jobs truthful after an application restart. Every retry is a new attempt linked to its predecessor, with the source and profile preserved.

## Acceptance

- Given a failed or cancelled job with its local source retained, when the user chooses Retry, then a new queued job with a distinct ID and `retryOf` link is created using the exact previous media/profile snapshot; the prior attempt remains unchanged.
- Given the prior source bytes are missing or unreadable, when retry is requested, then no new job is created and the UI explains that the original must be selected again.
- Given a stored job is queued/running/cancelling when the local app coordinator starts, then startup reconciliation marks queued/running attempts failed and cancelling attempts cancelled, with a recoverable explanation and no output attached.
- Given any recovered attempt, when Retry is selected, then normal local profile validation and source/artifact isolation rules still apply.

## Scope and constraints

Extend final-job persistence/contract with immutable retry linkage and startup reconciliation. Add local-source copying and a Retry action on failed/cancelled job details. Do not overwrite old attempts or source blobs. Keep retry policy explicit and do not choose a source-media retention duration; that remains open until separately approved.

## Implementation tasks

- [x] Add retry linkage to schemas, coordinator validation, and API create handling, including single-child reservation against duplicate concurrent retries.
- [x] Reconcile interrupted persisted jobs when the coordinator initializes, while returning defensive copies to preserve coordinator-owned state.
- [x] Validate and copy the retained local source to a fresh attempt ID and add keyboard-accessible retry/error UI with visible predecessor links.
- [x] Test predecessor immutability, retry/profile/source mismatches, missing/unreadable source, concurrent retries, startup recovery, and a browser model-unavailable → retry → successful local attempt path.

## Verification

Passed: 15 focused coordinator tests, the full unit suite (158 tests across 27 files), typecheck, lint, production build, and six browser E2E cases. Browser tests cover local-only retry request contents, keyboard retry, visible predecessor link, successful linked retry without changing the failed predecessor, missing and malformed local sources (no new job), and cancellation behavior. Startup tests cover queued, running, and cancelling records, with recovery outcomes persisted. The FFmpeg/WAV validation check also passes.

## Code Map

Shared final-job contracts; coordinator/persistence initialization; local source store; retry action/job detail UI; coordinator and browser tests.

## Design Notes

The immutable attempt graph is append-only. A retry carries the previous normalized media/profile values, not mutable editor settings. It obtains its own source-storage key and ID, and is validated as a new request before being persisted.

## Spec Change Log

- Initial Story 4.4 plan: model each retry as a separate linked attempt and reconcile stale in-flight states on startup.
- Independent review hardening: reserve one child attempt per retry predecessor, protect coordinator-owned job snapshots from caller mutation, explain recovered cancellation, verify source metadata/header before creating a retry, and cover retry locality and keyboard use.

## Review Triage Log

- `medium / patch` — Concurrent retry requests could both pass the async capability check and create siblings; a reservation now ensures only one direct retry per predecessor, and the latest failed/cancelled attempt starts the next retry.
- `medium / patch` — Recovered cancelled attempts did not tell users that the app restarted mid-cancellation; a persisted recovery notice is now announced and visible.
- `high / patch` — Coordinator `get`, `list`, `create`, `cancel`, and `consume` exposed owned object references; defensive structured clones now prevent external callers from mutating retained attempts.
- `medium / patch` — Missing retained-source behavior had no E2E coverage; tests remove the source, verify an accessible error, and confirm job count does not change.
- `medium / patch` — Corrupt/unreadable stored source could be retried into a new job; retry now checks metadata and RIFF/WAVE channel header before API creation, with browser coverage proving no new job.
- `medium / patch` — Retry request locality and metadata-only payloads were unverified; browser checks constrain its request to the same local origin and exclude media bytes.
- `low / patch` — The predecessor link was only present in job data; the job detail now exposes an accessible link to the earlier attempt.
- `medium / patch` — Retry keyboard operation and error announcements were unverified; browser E2E invokes retry with Enter and observes the `role=alert` result.
