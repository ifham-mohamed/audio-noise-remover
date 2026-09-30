# Story status review — 2026-09-30

This reconciliation compares the sprint tracker and story records with current implementation, tests, recent commits, and independent epic-by-epic reviews. On 2026-09-30, `npm test` passed **217 tests across 30 files**, and `npm run typecheck` and `npm run lint` passed. Focused reviewers additionally reported Epic 4: 42 tests across six files, and Epic 5: 85 tests across seven files plus 4/4 focused browser tests. Reproduce the complete automated run with those three package scripts; no production build or cross-OS physical-device run was performed in this review session.

## Reconciled story and epic state

| Epic | Story state | Epic state | Review conclusion |
|---|---|---|---|
| 1 — Trustworthy Local Workspace | 1.1–1.4 done | done | Implementation and automated checks are recorded complete. Manual responsive/accessibility checks remain verification follow-ups, not missing application code. |
| 2 — Add Media and Tune Speech Enhancement | 2.1–2.2 in progress; 2.3–2.5 done | in progress | 2.1/2.2 are reopened because actual media/audio-stream probing is missing; details and exit criteria are in the story records and deferred-work register. |
| 3 — Preview and Compare Improvements | 3.1 and 3.3 done; 3.2 review | in progress | Experimental preview and comparison code are implemented. Story 3.2 retains an unchecked human-observed Narrator task; do not claim the spoken success/cancellation states passed until recorded. Production model qualification remains outside the experimental story scope. |
| 4 — Process, Recover, and Retrieve Outputs | 4.1–4.5 done | done | 4.3/4.4 were already marked done in their story records; their sprint labels were stale. 4.1 and 4.5 were formally reviewed and closed. The bounded WAV/noise-removal output scope is intentional and documented. |
| 5 — History and Extensible Enhancement Profiles | 5.1–5.5 done | done | Implementation is recorded complete. Real macOS/Linux devices and manual assistive-technology use remain verification follow-ups; these were not represented as completed manual tests. |

The canonical machine-readable state is [sprint-status.yaml](sprint-status.yaml). Story evidence is in the linked story specifications: [Stories 2.1](spec-2-1-select-and-inspect-local-media.md), [2.2](spec-2-2-review-media-card-and-video-audio-stream.md), [3.2](spec-3-2-show-preview-progress-cancellation-and-failure.md), [4.1](spec-4-1-start-and-monitor-final-processing.md), [4.3](spec-4-3-cancel-active-final-processing-safely.md), [4.4](spec-4-4-retry-and-recover-interrupted-jobs.md), and [4.5](spec-4-5-review-and-retrieve-successful-output.md). Stories 1, the remaining Epic 2 stories, and Epic 5 have their completion evidence in their respective `spec-*.md` records.

## Open story acceptance work

### Story 2.1 — Actual local inspection

Current `inspectLocalMedia` uses an HTML media metadata event and synthesizes an `audio-0` stream. The local API validates the submitted metadata but does not inspect the media. This can incorrectly label a no-audio video as ready and does not prove the real format/signature or usable stream. Complete a local probe behind the media boundary, reject corrupt/no-audio/misleading inputs with stable errors, validate the metadata boundary, and add browser integration coverage for real fixtures before moving the story to review/done.

### Story 2.2 — Real video stream selection

The UI can render and select multiple streams when supplied metadata contains them, but current intake supplies only its synthetic `audio-0`; current multi-stream tests inject stream metadata. Discover actual streams, persist the selected ID, map it to the worker's real audio ordinal, and verify discovery/order/default/alternate selection/handoff with a multitrack browser fixture before moving the story to review/done.

### Story 3.2 — Spoken status verification

The implementation and automated lifecycle/artifact tests are complete for the approved experimental path. One explicit manual Narrator task remains unchecked. Record the actual spoken progress, preview-ready, cancelling, and cancelled announcements with OS, browser, and reader versions in the Story 3.2 manual-check table. Until then, the story and Epic 3 remain in review/in progress.

## Verification and product follow-ups

The follow-up register in [deferred-work.md](deferred-work.md) distinguishes the above story blockers from work outside completed story scope: production model qualification (including independent-set and PESQ evidence), adapters for other effects, broader final-format/video output, real cross-platform and assistive-technology checks, an explicit local-source retention policy, FFmpeg runtime/version and redistribution decisions, and safe source-identity prerequisites for any direct-save feature. Seven-format preview decode tests do not establish seven-format final-export support.

## Status semantics

`done` means the scoped story implementation and automated acceptance evidence were reviewed as complete; it does not imply all optional/manual follow-ups or future product capabilities are complete. Stories with explicit unchecked acceptance work remain `review` or `in-progress`. Epic status is `done` only when all its stories are done.
