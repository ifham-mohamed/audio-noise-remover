---
title: 'Story 2.2 — Review Media Card and Video Audio Stream'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd1f099ea6a3eb4bebc25adbfb5b6f228ea8cb784'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-2-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-2-1-select-and-inspect-local-media.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.1 establishes that a local file is readable, but users still cannot understand which audio stream a video will use or what the selected media means for the speech-first editor.

**Approach:** Extend the validated media contract and ready card to present a compact, audio-first media review surface. Show stream details when available, allow selection among multiple audio streams, and otherwise document a deterministic first-stream default without creating a job or changing the source.

## Boundaries & Constraints

**Always:** Preserve local-only processing, immutable originals, typed Zod contracts, stable user-safe errors, and Story 2.1 replace/remove behavior; show filename, media type, duration, file size, audio stream details, channel layout when known, sample rate when known, and output implications; identify video clearly while keeping the review/editor path audio-first; expose a labeled audio-stream selector when more than one stream is available; persist the selected stream in the local media draft/profile state; default deterministically to the first usable audio stream when selection metadata is unavailable; keep actions keyboard accessible, touch-sized, and understandable without color alone.

**Never:** Upload or remotely inspect media; decode media in React UI code; import FFmpeg, filesystem, or browser-inaccessible media primitives into UI components; mutate or overwrite the original; create a processing, preview, or history job; implement enhancement controls, waveform editing, output encoding, final processing, or detailed video playback in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AUDIO_CARD | Ready audio metadata | Show audio type, duration, size, stream summary, channels/sample rate when known, and local source badge | Preserve Story 2.1 card behavior when optional fields are absent |
| VIDEO_CARD | Ready video metadata with one usable stream | Show `Video with audio`, audio-first explanation, selected/default stream, technical details, and output implication | If stream is not usable, retain actionable no-audio error |
| MULTI_STREAM | Ready video metadata with multiple usable streams | Show a labeled select/radio control; choose one stream and store its id in the draft | Keep a valid selection when metadata changes; never silently select an unavailable id |
| DEFAULT_STREAM | Video metadata without stream choices | Select and display the first usable stream as the documented default | Explain that detailed stream choices are unavailable locally |
| REPLACE_REMOVE | Existing review card | Replace starts fresh inspection; Remove returns to empty intake and clears selected stream | Do not change source file or unrelated settings |

</frozen-after-approval>

## Code Map

- `shared/contracts/media.ts` -- extend audio metadata with stable stream ids, optional technical fields, and selected-stream state; preserve Story 2.1 schemas and format helpers.
- `features/intake/media-inspection.ts` -- keep local probing behind the inspection boundary and normalize one/default stream metadata without importing media tooling into UI code.
- `features/intake/intake-panel.tsx` -- extend the ready card into the media review surface; reuse existing replace/remove and accessible local-state behavior.
- `app/api/media/inspect/route.ts` -- continue validating the typed inspection envelope for future FFmpeg/media-adapter stream metadata.
- `tests/media.test.ts` -- validate stream contract, deterministic default, and optional technical metadata.
- `tests/intake.test.tsx` -- cover audio/video review rendering, multi-stream selection, default explanation, and safe replace/remove.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/media.ts` -- add stream identity, optional channel layout/sample rate, stream collection, and selected stream metadata -- let later processing profiles reference the intended stream safely.
- [x] `features/intake/media-inspection.ts` -- populate stream choices from actual local media-probe results and deterministically default to the first usable stream; do not synthesize a stream from browser metadata -- keep video validation audio-first and local.
- [x] `features/intake/intake-panel.tsx` -- render the review card and accessible stream selector/implications -- make the selected media understandable before editing.
- [x] `tests/media.test.ts`, `tests/intake.test.tsx`, and browser integration tests -- verify actual single/multi-stream video discovery, source-order/default selection, selected-stream persistence, and that the selected stream maps to the worker audio ordinal -- prevent selection drift and unsafe readiness.

**Acceptance Criteria:**
- Given valid audio metadata, when the review card renders, then the user sees type, duration, size, stream summary, and known technical details.
- Given valid video metadata with one audio stream, when the review card renders, then it identifies the video, explains the audio-first path, shows the selected stream, and describes the output implication.
- Given multiple usable audio streams, when stream metadata is available, then the user can select a stream by label and the selected stream id remains in the local draft state.
- Given no stream choices are available, when a video is ready, then the first usable stream is selected deterministically and the UI documents that default.
- Given Replace or Remove is selected, when the action completes, then the media review and selected-stream state are replaced or cleared without changing the source or unrelated settings.
- Given any review state, when operated by keyboard or touch, then all labels, status, focus, and primary actions remain accessible and no processing job is created.

## Implementation Notes

- Extended the shared media contract with optional stream ids, labels, channel layout, sample rate, stream collections, and selected stream state.
- Extended the local inspection result with a deterministic `audio-0` stream and first-stream selection metadata while keeping probing outside the UI component.
- Added an audio-first video review panel with output implications, technical details, accessible multi-stream selection, and documented fallback copy.
- Verified 39 tests, TypeScript, ESLint, and production build successfully.
- Review finding (2026-09-30): the current inspector always supplies one synthetic `audio-0` stream, so the selector has no real discovered streams to present. Existing tests with injected multiple streams verify the UI contract only; they do not prove actual track discovery or that the chosen track reaches processing.
- Replaced the synthetic stream with the local FFmpeg probe's ordered list of streams that each decode successfully. Stream records carry stable FFmpeg IDs and explicit audio ordinals; the first decodable stream is selected initially, and the selected ID is retained in the processing profile without remounting editor state.
- Preview worker mapping now resolves the selected stream ID to its probed FFmpeg audio ordinal, rather than using the index of the filtered UI list. Unit coverage verifies a selected ordinal of 2 produces `-map 0:a:2`; intake coverage verifies the selected ID is submitted in the preview profile.
- Edge integration verifies the AC-3/AAC fixture omits the undecodable AC-3 stream and defaults to the AAC stream, and a separate two-AAC fixture exposes both streams in source order and permits alternate selection. The test confirms no inspection API request.
- Added an explicit preview-worker client test proving that a selected discovered stream with FFmpeg audio ordinal 2 is handed to the worker as ordinal 2.
- Checks at implementation: `npm test -- --run tests/media.test.ts tests/intake.test.tsx tests/preview-worker-utils.test.ts` (21 passed), `npx playwright test tests/e2e/media-inspection.pw.ts` (2 passed), `npm run typecheck`, `npm run lint`, and `npm run build` passed.

## Spec Change Log

## Review Triage Log

- `blocking / in-progress` — Independent acceptance review found that real multi-stream discovery is not wired: the inspector fabricates a single stream and the API does not probe the selected file. Keep the story open until actual audio streams are discovered, the selected stream persists into the local processing draft/worker, and a multitrack fixture verifies the end-to-end choice.
- `false` — A reviewer suggested adding stream persistence and worker mapping to the frozen acceptance criteria. The criteria already require that the selected stream ID persist in the local draft; worker audio-ordinal mapping is recorded as an integration test task, while this story explicitly does not create processing jobs. The existing acceptance wording remains unchanged.
- `resolved` — The earlier blocking review finding is resolved: the probe returns real decodable stream choices, selection remains in the local draft/profile, and tests prove the selected identity maps to the corresponding worker audio ordinal.
- `medium / patch` — Same name/size/mtime can produce the same `sourceRef`; a new selection could reuse the prior editor state. Ready-card identity now includes a per-selection request sequence, and an intake regression test verifies fresh defaults for a same-reference replacement.
- `medium / patch` — Whole-file reads into the browser and FFmpeg WASM had no explicit intake bound. Inspection now rejects files above the shared 256 MiB limit before worker creation; a regression test verifies this.
- `medium / patch` — A hung probe could leave the UI inspecting indefinitely. Inspection now has a 60-second timeout that terminates the worker and returns a stable unavailable error; fake-timer coverage verifies settlement and termination.
- `false` — The probe log parser recognizes `Stream #0:<n>` only. This worker probes a single file as FFmpeg input 0 and the pinned FFmpeg 5.1.4 output format is covered by real-file browser fixtures; no alternate input index is applicable in this call path.
- `false` — The inspection flow could send media-derived telemetry through another endpoint. Code inspection shows `inspectLocalMedia` constructs the worker with the `File` and does not issue network requests; the E2E test additionally asserts no inspection POST. No media bytes or derived probe metadata are sent from this path.
- `false` — A full processing job should be created in Story 2.2 to validate the selected stream. This story explicitly forbids preview/processing job creation. The permitted boundary handoff is instead verified by the browser selection/profile test plus the preview-worker client test asserting the selected FFmpeg ordinal.
- `deferred` — Unknown-duration media handling is not specified as a required supported case, and current intake/output contracts require a validated finite duration for bounded preview and final-output limits. Revisit only with an explicit duration/streaming policy; no unsupported-media acceptance change is made here.
- `resolved` — Stale inspection completion after replacement/removal is guarded by a monotonically increasing request identity; a same-metadata replacement test ensures stale identity does not preserve prior editor state.

## Design Notes

Keep the review card calm and scannable: a media identity row, a technical details grid, then a clearly labeled audio-stream decision area only for video. Use a short “What happens next” note to explain that video is kept as video while speech enhancement runs on the selected audio stream.

## Verification

**Commands:**
- `npm test -- --run` -- expected: all tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- Review an audio file, a video with one stream, and a mocked/fixture video with multiple streams; verify stream selection, default copy, audio-first output implication, keyboard operation, and unchanged replace/remove behavior.

Implementation run (2026-09-30): automated Edge fixture coverage and the listed focused checks passed; human assistive-technology checks remain separate and are not claimed by this story run.

Final review verification (2026-09-30): selected track identity reaches the preview worker as the probed FFmpeg audio ordinal, including a nonzero ordinal. Independent acceptance review found no material blockers. Full unit suite passed (225 tests), full Edge browser suite passed (28 tests), TypeScript, ESLint, production build, and bundled FFmpeg core verification passed.
