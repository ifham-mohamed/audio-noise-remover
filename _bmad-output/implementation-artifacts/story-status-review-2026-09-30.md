# Story status review — 2026-09-30

This reconciliation compares the sprint tracker and story records with current implementation, tests, recent commits, and independent epic-by-epic reviews. On 2026-09-30, `npm test` passed **217 tests across 30 files**, and `npm run typecheck` and `npm run lint` passed. Focused reviewers additionally reported Epic 4: 42 tests across six files, and Epic 5: 85 tests across seven files plus 4/4 focused browser tests. Reproduce the complete automated run with those three package scripts; no production build or cross-OS physical-device run was performed in this review session.

## Reconciled story and epic state

| Epic | Story state | Epic state | Review conclusion |
|---|---|---|---|
| 1 — Trustworthy Local Workspace | 1.1–1.4 done | done | Implementation and automated checks are recorded complete. Manual responsive/accessibility checks remain verification follow-ups, not missing application code. |
| 2 — Add Media and Tune Speech Enhancement | 2.1–2.5 done | done | The final 2026-09-30 reviews resolve actual local probing and real stream discovery/selection. Story records contain real-fixture and worker audio-ordinal handoff evidence. |
| 3 — Preview and Compare Improvements | 3.1–3.3 done | done | The direct 2026-10-01 user report confirms all five named Narrator checks worked and closes Story 3.2's experimental manual acceptance. Exact speech was not transcribed or independently observed. Production qualification remains outside this scope. |
| 4 — Process, Recover, and Retrieve Outputs | 4.1–4.5 done | done | 4.3/4.4 were already marked done in their story records; their sprint labels were stale. 4.1 and 4.5 were formally reviewed and closed. The bounded WAV/noise-removal output scope is intentional and documented. |
| 5 — History and Extensible Enhancement Profiles | 5.1–5.5 done | done | Implementation is recorded complete. Real macOS/Linux devices and manual assistive-technology use remain verification follow-ups; these were not represented as completed manual tests. |

The canonical machine-readable state is [sprint-status.yaml](sprint-status.yaml). Story evidence is in the linked story specifications: [Stories 2.1](spec-2-1-select-and-inspect-local-media.md), [2.2](spec-2-2-review-media-card-and-video-audio-stream.md), [3.2](spec-3-2-show-preview-progress-cancellation-and-failure.md), [4.1](spec-4-1-start-and-monitor-final-processing.md), [4.3](spec-4-3-cancel-active-final-processing-safely.md), [4.4](spec-4-4-retry-and-recover-interrupted-jobs.md), and [4.5](spec-4-5-review-and-retrieve-successful-output.md). Stories 1, the remaining Epic 2 stories, and Epic 5 have their completion evidence in their respective `spec-*.md` records.

## Resolved review findings (reconciled 2026-10-01)

Story 2.1 is done. Its final review records a local FFmpeg browser-worker probe that verifies container, duration, and decodable audio rather than trusting HTML metadata. Edge fixtures cover MP3, WAV, M4A, FLAC, MP4, MOV, MKV, malformed/misleading media, and no-audio video; tests also cover size, timeout, and stale-selection guards. Media bytes are not sent to the inspection API.

Story 2.2 is done. Its final review records real decodable streams in source order, deterministic first-usable selection, alternate two-AAC-track selection, and selected-ID persistence. Worker-client and command-builder tests prove a discovered nonzero FFmpeg audio ordinal reaches processing unchanged (including ordinal 2), rather than using the filtered UI-list index.

Both story records report independent acceptance review with no material blockers, 225 unit tests, 28 Edge browser tests, typecheck, lint, production build, and bundled-core verification passing on 2026-09-30. These are recorded prior-run results, not checks rerun during this documentation reconciliation. They supersede the earlier 217-test snapshot and reopened findings; all Epic 2 stories are done, so Epic 2 is done.

## Completed experimental manual acceptance (2026-10-01)

### Story 3.2 — Spoken status verification

The implementation and automated lifecycle/artifact tests are complete for the approved experimental path. The user answered a question explicitly naming progress, ready, cancelling, cancelled, and retry: `yes all worked fine , Version154.0.4258.37(Official build)(64-bit)`. This direct report is sufficient to close the remaining manual acceptance work as a user-reported operational pass. Exact phrases were not transcribed and speech was not independently observed. User-supplied Edge version is `154.0.4258.37 (Official build) (64-bit)`; separately read current-device Windows metadata is Caption `Microsoft Windows 11 Pro`, Version `10.0.26100`, BuildNumber `26100`, not user-supplied test-environment evidence. Narrator standalone version was not supplied. The [manual matrix](../../docs/manual-verification.md) and Story 3.2 checklist/table now record these distinctions. Story 3.2 and Epic 3 are done for the experimental scope; production qualification is unchanged and physical macOS/Linux checks remain not tested.

## Verification and product follow-ups

The follow-up register in [deferred-work.md](deferred-work.md) records product follow-ups including production model qualification, other effects, broader final-format/video output, real cross-platform and assistive-technology checks, and direct-save source identity. The 2026-10-01 decisions are now recorded in [source retention](../../docs/source-retention.md), [FFmpeg runtime](../../docs/ffmpeg-runtime.md), and [the local-runtime ADR](../planning-artifacts/architecture/ADR-2026-10-01-local-runtime.md). Retry sources remain local until explicit linked-data cleanup, with no automatic source expiry. Bundled browser FFmpeg 5.1.4 is authoritative; native FFmpeg is optional diagnostics, with no browser requirement for 9.0.2. The parent reports the expanded encoder/remux core build and verifier passed, with FLAC/MP3/M4A roundtrips and MOV/MKV/MP4 remux producing identical video-stream packet hashes. Runtime/source/license assets include LAME sources and license. These bundled-core results do not establish complete browser final-job acceptance, metadata/chapter preservation, or spoken accessibility; redistribution review remains necessary.

## Status semantics

`done` means the scoped story implementation and automated acceptance evidence were reviewed as complete; it does not imply all optional/manual follow-ups or future product capabilities are complete. Stories with explicit unchecked acceptance work remain `review` or `in-progress`. Epic status is `done` only when all its stories are done.

Documentation reconciliation verification (2026-10-01): `npm test -- --run tests/final-artifact-store.test.ts tests/settings.test.tsx tests/cleanup-route.test.ts tests/final-job.test.ts` passed all 45 tests across four files. The allowed tracked-file diff passed `git diff --check`. This focused run supports the documented storage/cleanup semantics; it does not establish spoken accessibility, physical macOS/Linux behavior, or expanded encoder/remux support.
