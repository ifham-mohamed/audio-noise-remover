---
title: 'Story 5.1 — Browse and Filter Local Processing History'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b75b3c52ab90a7d6abcd8f62b0cbc19fc0ab852a'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-5-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The History surface is an empty placeholder, so users cannot find or return to their persisted final-processing attempts.

**Approach:** Present local final-job history newest-first with useful metadata, a direct empty state, and accessible search and status, media-type, date, and profile filters. This story lists final processing attempts; bounded previews remain separate from final-output history and are managed through their preview lifecycle/cleanup scope.

## Boundaries & Constraints

**Always:** Load records through the local no-cache API and authoritative coordinator; validate response data; keep filters in the view; show only state-valid actions; never expose media bytes or mutate job state from the UI. Preserve mobile, keyboard, focus, semantic status, and local-only behavior.

**Never:** Delete or mutate jobs, add preview playback/details, duplicate job lifecycle state, add remote history, or invent output actions beyond currently supported behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| EMPTY | API returns no final jobs | “No enhancements yet” and direct New enhancement action | N/A |
| FILTER | Jobs and one or more status/type/date/profile/search filters | Only matching rows remain; each active filter is visible and individually removable; Clear filters restores the full list | Invalid date range is surfaced and never silently returns misleading matches |
| ACTIVE | Queued, running, or cancelling job | Current status and View run link to the authoritative processing page; no terminal-only actions | N/A |
| LOAD_FAILURE | API/network error or invalid envelope | No fabricated empty state; explain local history could not be loaded and offer Retry | Preserve accessible error announcement |

</frozen-after-approval>

## Code Map

- `app/history/page.tsx` -- currently only renders a static empty placeholder; replace its body with the history client surface.
- `app/api/final-jobs/route.ts` -- existing local, no-store `GET` returns coordinator-owned persisted final jobs in an API envelope; reuse rather than adding another state writer.
- `server/domain/final-job-coordinator.ts` -- `list()` returns defensive copies, newest first, after startup reconciliation; do not bypass it or change lifecycle semantics.
- `server/adapters/final-job-file-store.ts` and `shared/contracts/final-job.ts` -- bounded local persistence and runtime schemas define available metadata, statuses, enabled stages, timestamps, and retry links.
- `app/processing/[id]/page.tsx` -- authoritative active final-run destination for the View run action.
- `components/app-shell.tsx` -- already links to History and supplies the surface header; preserve shell navigation.
- `tests/final-job-route.test.ts` -- existing list-envelope coverage; extend only if needed. Add focused History component tests; there are currently no History UI tests.
- Do not modify preview storage/coordinator or add preview records to final-output history in this story; previews are bounded review artifacts with their own lifecycle and Story 5.3 cleanup.

## Tasks & Acceptance

**Execution:**
- [x] `features/history/history-view.tsx` -- implement accessible loading/error/empty/list states, client-side filters/search, visible removable filter chips, and valid row actions from validated local records.
- [x] `app/history/page.tsx` -- compose the History view with the existing surface shell without replacing navigation behavior.
- [x] `tests/history-view.test.tsx` -- cover newest-first ordering, metadata, empty/error/retry states, every filter and chip removal, active-job View run, and action gating.
- [x] `tests/e2e/history.pw.ts` -- exercise the user-facing history navigation, filter reset, and active-run link using local fixtures only.

**Acceptance Criteria:**
- Given the user opens History, when local jobs load, then rows are newest-first and show source filename, media type, duration, processed date, enabled-stage/profile summary, and lifecycle status.
- Given jobs match selected status, media type, date range, profile stage, or text search, when filters change, then only matching local final attempts appear and each active filter can be removed independently.
- Given no final attempts exist, when History renders, then it says “No enhancements yet” and provides a direct New enhancement action; a no-match filtered state remains distinguishable and offers Clear filters.
- Given a job is queued, running, or cancelling, when its row renders, then it has an accessible View run link to that job and exposes no invalid output/retry actions.
- Given local history cannot load or its envelope is invalid, when the request settles, then the page announces the error and offers retry instead of presenting false empty history.
- Given history is loaded and filtered, when the user inspects network activity and diagnostics, then only job metadata is read locally; no media content is sent or logged.

## Implementation Notes

The History page fetches and runtime-validates the existing local final-job list. It sorts defensively by creation time, filters locally, announces load errors separately from the empty state, and only links queued/running/cancelling attempts to their authoritative processing page. No history or job mutations were added.

Focused UI/API tests passed (10 tests); `npm run typecheck`, `npm run lint`, `npm run build`, and `npx playwright test tests/e2e/history.pw.ts` passed.

## Verification

**Commands:**
- `npm test -- --run tests/history-view.test.tsx tests/final-job-route.test.ts` -- expected: all focused history and list-contract tests pass.
- `npm run typecheck` -- expected: success.
- `npm run lint` -- expected: success.
- `npm run build` -- expected: success.

**Manual checks:**
- Open History at desktop and mobile widths; verify keyboard filters, visible focus, readable status without color, and the empty/error states.

## Design Notes

Final attempts are the records represented by the History surface because they carry terminal output/retry state and have the supported “View run” route. Preview jobs remain bounded, separately labeled artifacts rather than final processing history; exposing them here would require a distinct return-to-preview route and is not implied by the current History interaction contract. Filtering remains in the client over the validated no-store local list; the store is size-bounded and no filter needs to mutate persisted history.

## Spec Change Log

## Review Triage Log

- medium / patch — The row called its `createdAt` value “Processed,” although the coordinator creates the attempt before it finishes; relabel the timestamp with an accurate neutral date label.
- medium / patch — Search included internal status values but not the visible status wording, so searching “Completed” did not find succeeded attempts; include the displayed label in searchable text.
- medium / patch — Date filtering derived a UTC day while the date shown used the viewer’s local timezone; use one local-calendar date key for both.
- false — The proposed hour-formatting concern is unreachable for jobs created by the current supported processing path, which rejects inputs longer than 120 seconds; the displayed minute:second format is adequate for that limit.
- medium / patch — Repeated initial fetches can resolve out of order (including the development Strict Mode effect replay) and let an older snapshot overwrite a newer one; ignore stale responses.
- medium / patch — The date-range error was visible but not programmatically associated with invalid date controls; connect it to both fields.
- false — The Playwright command was executed and recorded in Implementation Notes; moving it into the Verification command list is a spec-only edit, which this review workflow explicitly rejects.
- medium / patch — Existing filter tests could pass even if profile-stage filtering were removed because their fixtures shared the same stages and other predicates isolated the row; test matching and nonmatching profiles directly.
- medium / patch — The edge-case review independently identified the visible-status search mismatch above; same root cause and smallest fix: search both internal state and its displayed label.
