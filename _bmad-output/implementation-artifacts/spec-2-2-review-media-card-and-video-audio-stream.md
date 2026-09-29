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
- [x] `features/intake/media-inspection.ts` -- normalize a usable stream and deterministic first-stream fallback -- keep video validation audio-first and local.
- [x] `features/intake/intake-panel.tsx` -- render the review card and accessible stream selector/implications -- make the selected media understandable before editing.
- [x] `tests/media.test.ts` and `tests/intake.test.tsx` -- cover the matrix and acceptance behaviors -- prevent selection drift and unsafe readiness.

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

## Spec Change Log

## Review Triage Log

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
