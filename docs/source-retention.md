# Local retry-source retention

Decision accepted 2026-10-01 under the earlier user direction, “Remove linked local data too.” Keep app-retained retry-source copies locally until explicit linked-data cleanup. No automatic source expiry is adopted. The original selected file and browser downloads are outside app cleanup.

## Current implementation semantics

`features/final/final-artifact-store.ts` stores a copy of the selected file in browser IndexedDB database `ai-noice-removal-final-artifacts`, object store `sources`, keyed by the attempt's source reference (the client attempt ID). Records include bytes, name, type, last-modified time, and `storedAt`. `openFinalSource` validates and reconstructs a File; `storedAt` is not an expiry. Copies survive success, failure, cancellation, and reload while browser storage persists. Browser storage eviction or manual site-data removal can make retry unavailable; indefinite retention is an application policy, not a durability guarantee.

`final-process-action.tsx` saves the copy before requesting an attempt. `final-retry-action.tsx` reads the prior copy and saves a separate copy for the new linked attempt. A rejected create/retry response removes that new copy; a failure before sending the request also attempts removal. A request with an uncertain response can leave a copy for recovery/explicit cleanup. No terminal-completion deletion or age-based source pruning is implemented.

| Confirmed Settings action | App-managed data removed | Data retained |
| --- | --- | --- |
| Clear all previews (`REMOVE_PREVIEWS`) | Before/After preview artifacts except those used by active previews | Final outputs, retry sources, history |
| Clear outputs (`REMOVE_OUTPUTS`) | Stored final outputs; coordinator marks removed outputs unavailable | Retry sources, previews, history |
| Clear history (`CLEAR_HISTORY`) | Terminal attempt history and linked previews/outputs; stored retry copies referenced by terminal final jobs except references used by active final jobs | Active jobs and required data; active retry ancestry; history whose linked removal failed; unlinked orphan source copies |
| Clear all generated files (`REMOVE_ALL`) | Previews, outputs, and stored retry copies, including orphan copies, except protected active data | History metadata and active jobs/required data; removed outputs marked unavailable |

Cleanup is explicit and confirmed. `components/settings-panel.tsx` obtains a typed plan, deduplicates identifiers, and prepares a server cleanup lease before deleting browser artifacts. It re-lists storage to confirm absence and reports each removal/failure. `app/api/cleanup/route.ts` verifies the prepared plan and reported outcomes; coordinators update history/output availability. New jobs are gated during the lease. Active final source references and active preview artifacts are protected; active retry ancestors cannot be deleted from history. The lease's 120-second timeout is coordination expiry, **not source retention expiry**.

Cleanup is not an all-or-nothing transaction across browser storage and server history: failures retain linked history and report incomplete outcomes; interruption can leave output availability `removing` pending reconciliation. Clearing all generated files leaves history, so a later retry can fail because its retained copy is gone. Clearing history removes linked copies but does not sweep orphan sources; use Clear all generated files for those. Neither action deletes original filesystem files or already downloaded outputs.

The existing seven-day preview-artifact policy applies only to derived previews, including bounded comparison-source artifacts; it does not expire full retry sources. Outputs and history have explicit removal controls. This document records current cleanup behavior; it introduces no storage or cleanup code changes.

Evidence: `features/final/final-artifact-store.ts`, `features/editor/final-process-action.tsx`, `features/editor/final-retry-action.tsx`, `components/settings-panel.tsx`, `app/api/cleanup/route.ts`, `server/domain/final-job-coordinator.ts`, and `server/domain/local-cleanup-gate.ts`. Existing focused coverage includes `tests/final-artifact-store.test.ts`, `tests/settings.test.tsx`, `tests/cleanup-route.test.ts`, and `tests/final-job.test.ts`.
