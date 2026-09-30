---
title: 'Story 5.3 — Clean Up Generated Files and History Safely'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ab24b2f08976de0406b57d97f222126c8345afc0'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-5-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cleanup controls currently describe scopes that do not reliably remove the real app-managed IndexedDB artifacts or coordinator-owned history. Users need precise, local-only cleanup that cannot delete originals or claim success when part of the operation failed.

**Approach:** Implement four explicit cleanup scopes for previews, outputs, history metadata, and all generated files. Clear history also removes linked app-managed local bytes, including retained retry-source copies, while protecting active jobs and their required assets. Preserve safe history/output metadata when only generated files are removed, and report partial failures per affected item.

## Boundaries & Constraints

**Always:** Keep cleanup local and route history state changes through the owning coordinators and validated shared contracts. Delete only app-managed preview/output/retry-source artifacts; never delete original user files, browser downloads, or unrelated records. Keep active jobs and every artifact needed by their ongoing work; reconcile/coordinate before cleanup so no active input is removed. For output-only cleanup, retain history and diagnostics and mark the artifact unavailable as “Output removed.” For history cleanup, remove terminal history records and their linked app-managed bytes. Each action requires an accurate confirmation and returns item-level outcomes; failures leave unrelated data intact and must not be reported as successes.

**Never:** Mutate persisted job/history records directly from UI or storage adapters; treat source copies retained by the app as original user files; delete external files/downloads; remove assets needed by active jobs; erase safe history when only outputs are cleared; or report all-success after partial failure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| REMOVE_PREVIEWS | User confirms preview cleanup | Remove app-managed preview artifact pairs; keep jobs/history | Report failures by artifact without claiming complete success |
| REMOVE_OUTPUTS | User confirms output cleanup | Remove app-managed final outputs; retain safe attempt history and mark outputs removed | Keep failed items available/unknown and report item-level error |
| CLEAR_HISTORY | User confirms history cleanup | Remove terminal preview/final records and their linked preview, output, and retained retry-source bytes; preserve active jobs and assets they need | Preserve/report any record or linked bytes that could not safely be removed |
| REMOVE_ALL | User confirms all generated-file cleanup | Remove preview, output, and terminal-attempt retry-source copies; retain history metadata and mark missing outputs | Partial outcomes identify affected artifacts; unrelated data remains unchanged |
| ACTIVE_OR_UNRELATED | Active attempt, orphan artifact, or unrelated record present | Protect active attempts and necessary inputs; only target scope-owned data | Explain skipped active items and isolate failures |

</frozen-after-approval>

## Code Map

- `components/settings-panel.tsx` and `components/settings-storage.ts` -- cleanup scope choices, confirmation, and currently placeholder localStorage deletion; replace the placeholder effect with a typed cleanup command/result flow.
- `features/preview/preview-artifact-store.ts` -- IndexedDB preview-pair retention/removal and expiry; add scoped enumeration/bulk operations without crossing the storage boundary.
- `features/final/final-artifact-store.ts` -- app-managed final outputs and retained retry-source copies; add safe enumeration/removal operations and preserve immutable originals.
- `server/domain/preview-coordinator.ts`, `server/domain/final-job-coordinator.ts`, `server/adapters/preview-job-file-store.ts`, and `server/adapters/final-job-file-store.ts` -- authoritative job history and atomic persistence; add coordinator-owned cleanup mutations that protect active jobs.
- `shared/contracts/preview.ts`, `shared/contracts/final-job.ts`, and settings/API contracts -- runtime-validated cleanup commands/results and backward-compatible output availability; preserve existing job lifecycle states.
- `app/api/preview-jobs/route.ts`, `app/api/final-jobs/route.ts`, and cleanup route(s) -- local same-origin orchestration; keep filesystem/IndexedDB details out of UI and report partial results.
- `features/history/history-view.tsx` and `components/settings-panel.tsx` -- show removed-output status, exact scope descriptions, per-item results, and accessible confirmation/outcome announcements.
- `tests/settings.test.tsx`, `tests/preview-artifact-store.test.ts`, `tests/final-artifact-store.test.ts`, `tests/preview.test.ts`, `tests/final-job.test.ts`, and API/coordinator tests -- cover scope boundaries, active jobs, links, atomicity, retries, and partial failure.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/preview.ts`, `shared/contracts/final-job.ts`, and cleanup contract -- define strict cleanup scope/request/result schemas and an optional persisted output-availability marker; do not add job lifecycle states.
- [x] Preview/final artifact stores -- enumerate and delete only app-owned scoped artifacts, including retry-source copies linked to removed terminal history; provide idempotent removal and per-item failures.
- [x] Preview/final coordinators and file stores -- expose coordinator-owned history cleanup/output availability commands, protect active jobs, preserve safe metadata for output-only deletion, and persist changes atomically per store.
- [x] Cleanup API and settings UI -- implement explicit same-origin operations, precise confirm copy, accessible progress/results, and partial-failure presentation.
- [x] `features/history/history-view.tsx` -- render “Output removed” while retaining allowed safe output metadata/diagnostics.
- [x] Focused store/coordinator/API/UI tests -- exercise all matrix cases, active-job races, linked retry-source deletion, orphan data, idempotence, and partial failures.

**Acceptance Criteria:**
- Given cleanup scopes are displayed, when the user reviews them, then each scope precisely names what is deleted and retained before confirmation.
- Given the user confirms output cleanup, when app-managed output bytes are removed, then history remains and clearly reports “Output removed”; failures are not shown as removed.
- Given the user confirms Clear history, when cleanup completes, then terminal history records and their linked app-managed generated bytes, including retained retry-source copies, are removed; originals, external files, active jobs, and active-job dependencies remain.
- Given cleanup includes one failing item, when results are returned, then that item is identified and unrelated successful items/records remain consistent with their actual state.
- Given an output or history artifact is orphaned, when scoped cleanup runs, then only app-managed artifacts in the selected scope are affected and repeated cleanup is safe.

## Implementation Notes

Decision from the user: Clear history includes linked app-managed local bytes. “Linked” excludes immutable originals and files the user downloaded or saved outside the app. Active jobs and their required data are retained and reported as skipped.

Implemented exact-scope cleanup of preview pairs, final outputs, retry-source copies, and terminal attempt history. Coordinator-owned APIs preserve output metadata/history when only generated outputs are removed and prevent deleting active jobs or retry ancestry. A bounded cleanup lease prevents new jobs during client-side IndexedDB deletion; prepared artifact/history IDs are bound to that lease, and UI-side store listings confirm each artifact's final absence before the server finalizes history. Partial cross-store failures remain visible as itemized incomplete results. Confirmation uses a focus-managed accessible dialog with focus restoration. “Clear history” deletes linked app-managed bytes and records; “Clear all generated files” also sweeps orphaned app-managed assets while retaining history. Originals, external downloads, and active-job dependencies remain untouched.

## Spec Change Log

## Review Triage Log

- medium / patch -- Blind review found a job could start after the settings snapshot and before local deletion; cleanup now takes a bounded server lease, checks active source/artifact dependencies at preparation, and blocks preview/final creates and retries while deletion is underway. Cleanup API coverage verifies conflicting active work is rejected before mutation.
- medium / patch -- Blind review found an unbound client removal report could mark an artifact removed or erase history; the lease binds finish to the exact prepared artifact and history sets, the UI re-lists browser stores before attesting each deletion, and the route requires the reported success/failure partition to match the plan.
- medium / patch -- Blind review found one coordinator could commit history before another coordinator failed; final and preview history mutations now return separate itemized failure results and an incomplete response instead of turning a partial commit into an opaque request error.
- medium / patch -- Blind review found UI finalization errors hid already-known artifact outcomes; the settings panel displays verification-pending items before rechecking local stores and keeps those details visible if a later API step fails.
- false -- Blind review said a resolved delete could claim a missing artifact was removed; cleanup verifies absence after deletion, and an artifact already absent meets the requested final cleanup state rather than leaving bytes behind.
- medium / patch -- Blind review found “complete” ignored retry-ancestry skips; cleanup marks the result incomplete when final or preview history must remain for an active retry and reports those records individually.
- low / patch -- Blind review found the “7-day cleanup” badge sat beside an all-previews action; copy now distinguishes seven-day retention from the explicit “Clear all previews” operation.
- false -- Blind review said failed/cancelled history could claim its output was removed; coordinator output removal only applies when a job has output metadata, and the contract permits output metadata only on succeeded jobs, so that trigger cannot occur through this cleanup path.
- false -- Blind review flagged `next-env.d.ts`; its `.next/dev/types` imports are the user's existing generated-file change and have been preserved, never staged, and excluded from this story's commit.
- medium / patch -- Edge review independently found the active-job start race; same root cause and lease/dependency-check patch as the first finding.
- medium / patch -- Edge review independently found forged or mismatched removed-ID claims; same root cause and prepared-plan/re-list verification patch as the second finding.
- patch -- Verification-gap review found settings tests used empty IndexedDB and could pass while outputs remained; added a user-action test that stores a valid output, confirms cleanup, verifies it no longer opens, and checks the exact output ID sent for finalization.

## Design Notes

Browser IndexedDB and server-side file-backed history cannot participate in one atomic transaction. Treat cleanup as an explicit itemized workflow: persist truthful artifact availability/history outcomes through coordinators, perform idempotent local deletions, and surface any incomplete item so it can be retried. Never infer removal from a successful history mutation alone. Avoid deleting terminal records until all linked artifact outcomes are known; where a linked deletion fails, retain the relevant record/details and report the failure. Active-job checks must be based on coordinator-owned current state, not stale UI snapshots.

## Verification

**Commands:**
- `npm test` -- expected: all repository tests pass, including cleanup scopes, ownership, output availability, active attempts, orphan data, and partial failures.
- `npm run typecheck` -- expected: success.
- `npm run lint` -- expected: success.
- `npm run build` -- expected: success; restore the pre-existing user-owned dev imports in `next-env.d.ts` after generated-file changes and exclude it from staging.
- `npx playwright test tests/e2e/cleanup.pw.ts tests/e2e/history.pw.ts` -- expected: accessible cleanup confirmation/focus/result behavior and history details work in browser.

**Manual checks:**
- Confirm every scope; verify originals/downloads are untouched, active work is protected, linked local bytes are removed, and partial-failure messages name affected items.
