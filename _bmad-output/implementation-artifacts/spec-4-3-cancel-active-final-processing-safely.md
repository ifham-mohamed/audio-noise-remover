---
title: 'Story 4.3 — Cancel Active Final Processing Safely'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4a55d47'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-4-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
---

## Intent

Let a user stop an active local final-processing attempt without exposing an incomplete output or leaving the job permanently active. Cancellation is final and distinct from retry.

## Acceptance

- Given a running final job, when the user requests cancellation, then the coordinator persists `cancelling`, stops the browser worker, and records `cancelled` only after worker termination is confirmed.
- Given cancellation wins a race with progress, failure, or success, then event sequencing permits exactly one terminal outcome; no output is retained or exposed for a cancelled job.
- Given cancellation cannot be persisted, then processing remains active and the UI explains that cancellation could not be confirmed; it does not claim success.
- Given a job is cancelling or cancelled, then progress is not accepted and the UI/live region distinguishes cancelling from cancelled.
- Cancellation remains browser-local; the API receives only typed lifecycle metadata, never media or output bytes.

## Scope and constraints

Add an explicit cancellation command and terminal event to the existing final-job contract/coordinator/API. Keep the worker lifecycle browser-local through a job-keyed registry that survives route changes within the same tab. Cancellation during ONNX execution may be cooperative, but worker termination is the hard stop for FFmpeg decode/encode. The worker owns no persistent output until successful validation; messages arriving after cancellation begins are ignored. Do not add pause/resume, cross-tab control, or cancellation for already terminal/queued jobs.

## Implementation tasks

- [x] Extend shared command/event schemas and coordinator transition rules for running → cancelling → cancelled.
- [x] Implement race-safe local worker registry/cancellation and ensure no late worker message creates a successful artifact; retry terminal confirmation after a transient save failure.
- [x] Add keyboard-operable cancel action, pending/error feedback, and distinct status announcements without repetitive elapsed-time announcements.
- [x] Test event sequencing, late events, worker termination, no-output guarantees, local-only request bodies, keyboard cancellation, and browser cancellation while inference is active.

## Verification

Passed: focused coordinator tests (12), typecheck, lint, production build, and four browser E2E cases. The cancellation case interrupts a held model request, uses keyboard activation, verifies the cancelling live-region message, injects one transient failure while saving the cancelled terminal event, retries confirmation successfully, and checks no artifact appears even after the late model response is released. Actual spoken Narrator verification remains a manual follow-up and is not claimed complete.

## Code Map

Shared lifecycle contracts; final-job coordinator and route; browser final worker runner/registry; final job monitor; final-job and Playwright tests.

## Design Notes

The server coordinator remains the sole persisted-state owner. Client termination is the point where the app knows the worker can no longer produce more bytes. Only then may the client submit the `cancelled` terminal event after the coordinator has acknowledged `cancelling`.

## Spec Change Log

- Initial Story 4.3 plan: make final-job cancellation explicit, race-safe, local-only, and artifact-safe.
- Independent review hardening: retry terminal cancellation confirmation after persistence errors; only expose stop control when the current tab owns the worker; ensure live announcements are stable and test post-cancel late responses and metadata-only cancellation requests.

## Review Triage Log

- `medium / patch` — The live region included elapsed time on each poll and could repeatedly announce it; it now announces stable processing state while elapsed time remains outside the live region.
- `medium / patch` — A late model response was released after the initial no-artifact assertion; the browser test now releases it and checks storage again.
- `high / patch` — A transient failure saving the terminal cancellation event could leave a stopped worker/job in `cancelling`; the tab retains a retryable finalization action, reads authoritative state, and safely retries with the current sequence.
- `medium / patch` — A stale running status after full reload could show a cancel action without a worker; the action is hidden without a tab-owned worker and the UI explains status availability.
- `medium / patch` — Cancellation had pointer-only coverage; browser E2E now invokes it with keyboard Enter and checks distinct cancelling/cancelled live-region messages.
- `low / patch` — The cancellation request's metadata-only boundary was not asserted; E2E verifies `{ command: "cancel" }` and checks request bodies contain no media/artifact markers.
- `medium / defer` — Real Narrator speech remains unverified; automated keyboard and live-region semantics are covered, but the user must still perform the practical Narrator check because this runtime cannot confirm spoken output.
