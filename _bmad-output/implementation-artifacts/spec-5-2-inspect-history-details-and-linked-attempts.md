---
title: 'Story 5.2 — Inspect History Details and Linked Attempts'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b90909591221a495b1b4e32ccccf5873441fb422'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-5-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** History rows expose only a summary, making it difficult to understand how an attempt ran, diagnose a failure, or follow a retry chain.

**Approach:** Add an accessible per-attempt details disclosure showing recorded profile, media, output, terminal, model/runtime, and safe diagnostic information. Derive chronological retry relationships from coordinator-owned history, preserve independent attempts, and reuse the existing local retry flow for eligible failed or cancelled attempts.

## Boundaries & Constraints

**Always:** Keep job state coordinator-owned and history local-only. Maintain compatibility with older persisted jobs by making new metadata optional and honestly labeling unavailable historical facts “Not recorded.” Treat model/runtime information as the configured execution snapshot, not evidence of quality qualification. Copy only allowlisted IDs, state, stable error codes, timings, profile parameters and model/runtime summary; exclude source names/paths, media bytes, raw audio, file contents, and secrets. Keep retries as linked new attempts and do not overwrite or remove prior records.

**Never:** Add a second history store, infer execution facts for old jobs, claim experimental models are production-qualified, or alter Epic 4 retry eligibility/processing behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| DETAILS | Any loaded attempt | Keyboard-operable disclosure shows ordered enabled stages with parameters, input metadata, output metadata only when present, execution snapshot or “Not recorded,” job/request IDs when present, and terminal reason | Missing optional historical fields are labeled; no fabricated values |
| LINEAGE | Retry chain, missing parent, or older record | Show known predecessor and descendants in chronological order, each with its own state and details | Missing referenced attempt is identified as unavailable; do not break history rendering |
| RETRY | Failed/cancelled record with available or missing browser-retained source | Reuse existing retry action; successful start creates a new linked attempt and preserves prior records | Existing safe source-unavailable and request errors remain visible |
| COPY | Clipboard works, denied, or unavailable | Copy safe per-attempt diagnostic text; offer selectable fallback when clipboard fails | Announce result accessibly; never include media names, paths, bytes, contents, or secrets |

</frozen-after-approval>

## Code Map

- `features/history/history-view.tsx` -- owns validated local listing, filters and current row presentation; extend rows with accessible details and compute lineage from this loaded list, preserving filtering/list behavior.
- `shared/contracts/final-job.ts` -- strict Zod schema, request envelope, and `createFinalJob`; add optional backward-compatible request ID and configured execution snapshot, and a safe diagnostic formatter based on explicit fields only.
- `app/api/final-jobs/route.ts` and `server/domain/final-job-coordinator.ts` -- API creates a request ID and coordinator owns creation; persist that ID on each new attempt without accepting caller-supplied IDs or bypassing coordinator validation.
- `features/editor/final-retry-action.tsx` -- already validates local source and posts a new attempt linked to `retryOfJobId`; reuse as-is unless details composition needs only presentation adjustments.
- `features/final/final-worker.ts`, `features/preview/dpdfnet-adapter.ts`, and `models/manifest.json` -- current configured experimental model identity and worker/WASM execution route; derive one stable snapshot from these sources, label it experimental/configured, and do not infer host machine or claim production qualification.
- `components/diagnostics-panel.tsx` -- clipboard/fallback interaction precedent; reuse accessible feedback pattern, not its device-wide payload.
- `tests/history-view.test.tsx`, `tests/final-job.test.ts`, `tests/final-job-route.test.ts`, `tests/e2e/history.pw.ts` -- extend focused contracts/UI/API and local-fixture browser coverage.
- `app/processing/[id]/page.tsx` and `features/editor/final-job-view.tsx` -- existing processing destination and retry-of display; do not change retry lifecycle or output retention.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/final-job.ts` -- add optional request ID and versioned configured model/runtime snapshot fields, retaining parse compatibility for old store entries; generate safe diagnostic text with stable allowlisted context.
- [x] `app/api/final-jobs/route.ts`, `server/domain/final-job-coordinator.ts` -- associate the server-generated request ID and execution snapshot with every new attempt, including retry attempts, while keeping IDs server-owned and coordinator-persisted.
- [x] `features/history/history-view.tsx` -- implement semantic, keyboard-operable details disclosure for full profile parameters, selected input stream/metadata, success output metadata, terminal reason, identifiers, execution snapshot, safe copy/fallback and chronological linked attempts; show existing Retry only for failed/cancelled states.
- [x] `tests/final-job.test.ts`, `tests/final-job-route.test.ts`, `tests/history-view.test.tsx`, `tests/e2e/history.pw.ts` -- verify legacy schema compatibility, ID association, lineage/broken links, per-state details, retry preservation, and diagnostic redaction including clipboard fallback.

**Acceptance Criteria:**
- Given a history row is expanded, when details render, then enabled stages and parameter values, input metadata, output metadata only when available, configured model/runtime summary, job ID, available request ID, and terminal reason are shown.
- Given attempts share retry links, when any linked attempt is expanded, then known predecessor and subsequent attempts are identifiable chronologically, retain distinct IDs/states/diagnostics, and missing historical records do not prevent rendering.
- Given a failed or cancelled attempt is eligible for retry, when Retry succeeds, then the existing Epic 4 flow creates a new attempt linked to its parent and the older attempt remains unchanged in history; other states do not expose Retry.
- Given the user copies attempt diagnostics, when clipboard succeeds or falls back, then a clear accessible result is provided and the text contains only the documented allowlist, never media names, file paths, source bytes, raw audio, complete file contents, or secrets.
- Given a record predates the optional snapshot fields, when its details render, then no execution facts are invented and the UI says the details were not recorded.

## Implementation Notes

Added optional, schema-validated request IDs and configured execution snapshots; the API owns the request ID and the coordinator persists it with the attempt. History disclosures show profile parameters, input stream metadata, success output metadata, terminal state/reason, identifiers, and experimental model/runtime configuration. Retry lineage is derived from existing parent links and tolerates missing ancestors. Diagnostic copy uses a field allowlist that excludes media names, source references, and output names; denied clipboard access exposes selectable safe text. Existing retry behavior is reused without lifecycle changes.

Focused unit/API/UI suite passed (36 tests); History Playwright coverage passed after keyboard activation was verified; typecheck, lint, production build, and diff whitespace validation passed. Review patches add cycle protection, filter-independent attempt links, globally chronological lineage ordering, and correct handling for unavailable selected-stream metadata. `next-env.d.ts` contains a user-requested pre-existing development-types change and is preserved, excluded from the story commit.

## Spec Change Log

## Review Triage Log

- medium / patch -- Blind review found schema-valid retry cycles could loop during ancestor traversal; added a visited-ID guard and regression coverage to stop safely.
- medium / patch -- Blind review found linked-attempt fragments could target rows hidden by active filters; changed links to the authoritative per-attempt processing route and asserted destinations.
- medium / patch -- Blind review found branched legacy retry graphs were only breadth-first ordered; sort the deduplicated full lineage chronologically and cover a branched fixture.
- low / patch -- Blind review found mismatched selected-stream metadata could be mislabeled using a fallback stream; show metadata only for the selected ID and otherwise state unavailable, with a regression test.
- false -- Blind review questioned the `next-env.d.ts` dev-type import paths; this is the user's pre-existing generated change, expressly preserved and excluded from all story staging/commits, so it is not introduced by or included in this change.
- false -- Blind review said the details input section omits the source filename; the containing history row heading already displays the source filename immediately above the disclosure.
- false -- Blind review said Retry is shown when the local source might be unavailable; the reused `FinalRetryAction` checks the browser-retained source before POST and reports its absence, while local IndexedDB availability cannot be authoritatively known by the history list.
- medium / patch -- Edge-case review independently found retry-cycle traversal lacked a visited-ID guard; same cycle root cause and regression fix as the first entry.
- medium / patch -- Verification-gap review independently found retry links could point to filtered-out history rows; same reachability root cause and processing-route link fix as the second entry.

## Design Notes

The configured execution snapshot must be tied to the actual selected worker/model implementation and explicitly identify the current DPDFNet candidate as experimental and not production-qualified. Keep the snapshot optional for old records; do not backfill from current configuration because that would misrepresent historical execution. Derive ancestry from the loaded records’ `retryOf` values; sorting by creation time makes gaps and older retained parents safe to display without adding mutable child lists.

## Verification

**Commands:**
- `npm test -- --run tests/final-job.test.ts tests/final-job-route.test.ts tests/history-view.test.tsx` -- expected: contract, route, details, lineage, retry gating, redaction, and fallback tests pass.
- `npm run typecheck` -- expected: success.
- `npm run lint` -- expected: success.
- `npm run build` -- expected: success.
- `npx playwright test tests/e2e/history.pw.ts` -- expected: local history details and linked-attempt interactions pass.

**Manual checks:**
- Use keyboard only to expand/collapse details, follow attempt links, activate Retry when valid, and copy diagnostics. Confirm focus is visible and no source filename/path appears in copied text.
