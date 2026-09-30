---
title: 'Story 5.5 — Cross-Platform History and Cleanup Behavior'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '4520ee7927787edd406f869a2e9c4364ddfab429'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-5-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** History reports successful output metadata but did not offer a history-level save path or verify that the corresponding browser-local artifact still exists after restart. Browser-only execution also cannot reveal host folders or disclose absolute paths.

**Approach:** Make history actions reflect the actual retained artifact and browser capabilities. Validate saved bytes against the success record before offering the browser-managed download. Do not write to an arbitrary picked path because the browser cannot verify it is distinct from the original source. Explain unavailable folder reveal and path copying in plain language, offer filename-copy as a truthful alternative, and never synthesize a path or substitute original media.

## Boundaries & Constraints

**Always:** Keep artifacts in local browser storage until the user initiates a browser download. Validate the artifact ID, name, MIME type, size, duration, and WAV contents through the existing artifact store. Preserve coordinator-owned history and restart reconciliation. Detect browser action availability at runtime; never infer filesystem access from OS identity. Use accessible status announcements and selectable fallback when clipboard access is denied.

**Never:** Claim a browser can reveal a local folder, invent an absolute output path, save without user action, expose source audio in place of missing output, or mutate persisted job/history records from UI code.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [x] Inspect existing OS/browser diagnostics, output retention, final-output validation, history rows, and restart reconciliation.
- [x] Add history output actions that reopen and validate the locally retained artifact before enabling save/download.
- [x] Use the safe browser-managed download path (not arbitrary-path writes); explain unavailable reveal and path-copy capabilities without claiming a fake path.
- [x] Add accessible filename-copy and selectable fallback behavior, plus user-facing status for save and artifact unavailability.
- [x] Add browser and restart-oriented verification for missing and mismatched output artifacts; preserve coordinator reconciliation for job status/retry lineage.

**Acceptance Criteria:**
- Given a successful history record, when its output exists locally and matches the record, then a supported save option is enabled and stores only that validated output on explicit user action.
- Given local bytes are missing or disagree with the record, when history is reopened, then save is unavailable and the UI explains the artifact cannot be recovered from the source.
- Given the browser cannot reveal a folder or expose a path, when output actions render, then those actions are unavailable with a plain-language explanation while supported save/download and filename-copy remain available.
- Given clipboard access is unavailable, when a user requests a filename copy, then a selectable fallback is shown and the limitation is announced.
- Given history is reopened after restart, when records are reconciled, then authoritative job states and retry links remain coordinator-owned, and output availability is checked against the local artifact store before enabling actions.

## Code Map

- `features/history/history-view.tsx` -- renders coordinator-provided attempts and output metadata; keep lifecycle and cleanup mutations out of this component, and add output actions only for successful, retained outputs.
- `features/history/history-output-actions.tsx` -- new browser-only boundary; query `openFinalOutput`, compare retained metadata with the record, use the browser download mechanism, detect clipboard support, and show truthful unsupported-action help.
- `features/final/final-artifact-store.ts` -- owns IndexedDB output lookup and validates WAV bytes; reuse `openFinalOutput` rather than duplicating storage reads or trusting a history flag.
- `server/domain/final-job-coordinator.ts` and `server/adapters/final-job-file-store.ts` -- reconcile persisted queued/running/cancelling attempts after restart and retain retry ancestry; do not create a second history state model.
- `components/diagnostics-panel.tsx` and `server/adapters/capability-detector.ts` -- already expose browser feature and OS/runtime facts; history uses actual available download/clipboard behavior and does not infer folder access from platform.
- `tests/history-output-actions.test.tsx`, `tests/history-view.test.tsx`, `tests/e2e/history.pw.ts`, `tests/final-job.test.ts`, and `tests/capabilities.test.ts` -- validate artifacts/actions in component/browser tests, supported OS detection, and coordinator restart behavior in the existing lifecycle suite.

## Implementation Notes

The browser artifact store deliberately does not retain absolute host paths. The intake flow also retains a `File`, not a durable source-path handle, so an arbitrary-path save picker cannot establish that its target is not the original. In accordance with Story 4.5, retrieval uses the browser-managed download only; history does not write into a picked path. Show in folder and Copy output path are disabled with specific explanations, while Copy output name is the privacy-preserving alternative. Successful history output actions reopen and compare the stored artifact with the validated success snapshot first; if bytes were cleared or the artifact does not match, action controls remain unavailable and no source media fallback is used.

The user-selected destination policy was refined during review: the save picker could not prove source identity, even with a non-empty-file check, so that path was removed rather than represented as safe. Existing speech processing, coordinator recovery, artifact validation, and truthful browser-path messaging remain unchanged.

Restart job-state recovery remains coordinator-owned and is covered by `tests/final-job.test.ts` (persisted queued/running attempts recover as failed; cancelling recovers as cancelled). `tests/e2e/history.pw.ts` adds browser verification for a persisted success record whose browser-local bytes have disappeared. Component tests cover metadata mismatches and the browser download action.

## Spec Change Log

- Review found the draft's save-picker approach conflicted with Story 4.5 and source-preservation policy because the browser intake does not retain a source path handle. The requirement now uses browser-managed downloads only, avoiding arbitrary destination writes; KEEP validated artifact re-open, missing/mismatched fail-closed behavior, accessible copy fallback, and coordinator-owned restart reconciliation.

## Review Triage Log

- low / patch -- Blind review found the action section used `aria-label` on a generic container without a semantic role; it is now an accessible `role="group"`, covered by the component test's named group query.
- medium / patch -- Blind review found tests overwrote `navigator.clipboard` and `window.showSaveFilePicker` without restoring descriptors; teardown now restores original descriptors and URL methods after each test, preventing cross-test contamination.
- medium / patch -- Blind review found saving to an arbitrary selected path could overwrite a source because no durable source-path handle exists. The save-picker implementation was removed; history now uses the established browser-download-only retrieval path from Story 4.5.
- medium / patch -- Blind review found direct file writes needed partial-write cleanup; the direct writer was removed entirely, so History cannot leave a partially written destination or write over an original.
- false -- Blind review noted untested picker cancellation/write/close failures; these paths no longer exist because history does not invoke the file-system picker or write to arbitrary paths. Browser download failures are reported through the existing safe error status.
- medium / patch -- Blind review found only filename mismatches were covered; parameterized cases now reject filename, MIME type, byte size, and duration mismatches before enabling save.
- medium / patch -- Verification review found the browser-download fallback was only asserted present, not exercised; a component test now clicks it and verifies the exact validated blob and filename are passed to the anchor, with its URL retained until unmount.
- medium / patch -- Verification review independently identified possible overwrite through the File System Access save picker; the same removal of arbitrary-path writing described above resolves this finding.
- medium / patch -- Edge review found a fixed one-second object-URL revocation could interrupt a delayed/large download; the URL now remains for up to 60 seconds, is reused during that window, and is released on artifact change or unmount, with a lifecycle assertion.
- low / patch -- Review noted the browser test title implied a real application restart although it supplied a persisted success response and missing IndexedDB artifact; its title and spec notes now distinguish browser artifact reconciliation from the coordinator restart test in `tests/final-job.test.ts`.
- medium / patch -- Blind review found the download status claimed the browser had started an action the app cannot observe; status now says the browser was asked to download and will manage the copy.
- medium / patch -- Blind review found revalidation failure left stale download controls enabled; the component now clears the retained artifact state and releases its URL when bytes disappear or no longer match during a download.
- low / patch -- Blind review found opened history rows could retain large object URLs indefinitely; URLs now expire after a minute (while remaining available to delayed download handling) and are also released on row unmount or artifact change.
- medium / patch -- Blind review found OS detector tests alone did not cover history behavior; parameterized component tests now verify the same capability-based save actions and platform explanation for Windows, macOS, and Linux navigator identities.
- medium / patch -- Blind review and verification-gap review found no real browser test for a successful History download; the final-output E2E now opens the actual retained record in History and verifies the downloaded filename and exact bytes.
- low / patch -- Blind review found a duplicate empty Spec Change Log heading; the duplicate heading has been removed.
- medium / patch -- Verification review found the download test did not assert its promised success status; the component test now checks the exact status announcement.
- medium / patch -- Edge review found an artifact prop change could leave an object URL for the previous artifact; effect cleanup releases the previous URL before loading the new record, covered by a rerender test.
- false -- Edge review said an initial artifact lookup completing after unmount could leak an object URL; `openFinalOutput` returns a Blob and does not create a URL, and the effect's active guard prevents state updates after unmount. URLs are created only in the explicit save handler and are lifecycle/timer cleaned.

## Design Notes

Browser security intentionally hides the absolute path of browser-managed files. A saved artifact in IndexedDB is not the same as a downloaded user copy. The app reports that distinction and never labels an opaque IndexedDB key as a path or writes into an unverified path.

## Verification

- `npm test` -- all 217 tests pass, including history actions, artifact mismatch/missing state, platform capability cases, and coordinator restart recovery.
- `npm run typecheck` and `npm run lint` -- pass.
- `npm run build` -- production build succeeds; exclude the user's `next-env.d.ts` edit.
- `npx playwright test tests/e2e/history.pw.ts tests/e2e/final-output.pw.ts` -- History hides missing outputs and successfully downloads a retained History artifact with exact bytes in Edge; final-output preservation and download tests pass.
- `git diff --check` -- no whitespace errors.
- Manual: verify browser download behavior, unavailable reveal/path explanations, and no original-media fallback in a supported desktop browser. Cross-OS real-device checks remain a separate manual matrix; unit tests exercise the OS detector's configured runtime values.
