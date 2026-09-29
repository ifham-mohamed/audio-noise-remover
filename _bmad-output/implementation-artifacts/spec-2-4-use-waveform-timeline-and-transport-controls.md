---
title: 'Story 2.4 — Use Waveform, Timeline, and Transport Controls'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f9489438ab11291baad75766a50c06b0ac03a999'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-2-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-2-3-configure-independent-speech-effects.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The validated media editor exposes metadata and enhancement settings but gives users no reliable way to hear the source, locate a meaningful moment, or choose a preview range.

**Approach:** Add an audio-first timeline surface backed by native local media playback. It will show a semantic waveform-like overview, time ruler, playhead, duration, preview bounds, and accessible text time controls, with consistent play/pause, seek, mute, and keyboard behavior.

## Boundaries & Constraints

**Always:** Keep the original local media immutable and playback local-only; preserve the selected audio stream and processing draft; show current time and duration as text; make waveform interaction additive to buttons/inputs; keep controls keyboard and touch operable with visible focus; respect reduced-motion and high-contrast settings; prevent Space from toggling playback while focus is in text input or another editable control; degrade safely when browser media or waveform detail is unavailable.

**Never:** Create a preview or final processing job; perform enhancement, upload, remote playback, or media decoding in React beyond browser playback; introduce canvas-only interaction; implement before/after comparison, output settings, cancellation, retry, or final processing in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| READY_MEDIA | Valid local audio/video with duration | Show waveform overview, ruler, playhead at zero, current time, duration, and preview bounds | Keep text time readout usable if waveform rendering is limited |
| TRANSPORT | User activates play/pause or mute | Native playback state, button label, and playhead remain synchronized | Disable or explain unavailable playback without losing the draft |
| SEEK | User clicks/taps timeline, changes time input, or uses keyboard seek | Clamp position to media duration and update readout/playhead | Ignore malformed values and retain the last valid position |
| SHORT_OR_EMPTY | Duration is zero, very short, or metadata is unavailable | Show a stable no-seek/limited timeline state | Explain that a usable duration is required for seeking |
| REDUCED_MOTION | Reduced motion is enabled | Keep accurate time feedback with static or minimal playhead transitions | Do not hide transport feedback |

</frozen-after-approval>

## Code Map

- `features/intake/intake-panel.tsx` -- owns the selected local `File`, validated metadata, selected video audio stream, and composition point for the editor surface; pass the file and duration into the timeline without changing inspection behavior.
- `features/editor/effect-inspector.tsx` -- existing independent speech controls; keep it below or alongside the new timeline and preserve its profile state.
- `features/editor/waveform-timeline.tsx` -- new client component for local object-URL playback, semantic waveform/timeline, ruler, playhead, preview bounds, time readout, and transport actions.
- `shared/contracts/media.ts` -- reuse validated media metadata and duration contracts; do not add browser or filesystem primitives to shared contracts.
- `shared/contracts/settings.ts` -- reuse playback seek interval and reduced-motion/waveform-contrast preferences where available without coupling playback to settings storage.
- `tests/waveform-timeline.test.tsx` -- cover initial state, transport, seek clamping, keyboard behavior, mute, fallback, and reduced-motion-safe feedback.
- `tests/intake.test.tsx` -- verify the timeline appears only for validated media and receives the selected local media context.

## Tasks & Acceptance

**Execution:**
- [x] `features/editor/waveform-timeline.tsx` -- implement local native playback with semantic timeline and accessible transport -- make waveform interaction optional and resilient.
- [x] `features/intake/intake-panel.tsx` -- pass selected file and validated duration into the timeline -- preserve media and effect draft state.
- [x] `tests/waveform-timeline.test.tsx` and `tests/intake.test.tsx` -- cover the edge-case matrix and editor composition -- prevent regressions in keyboard and fallback behavior.

**Acceptance Criteria:**
- Given valid media is loaded, when the editor renders, then it shows a semantic waveform overview, time ruler, playhead, current-time readout, duration, and preview bounds.
- Given the user operates transport controls, when they choose play/pause or mute, then native playback state, labels, and playhead feedback stay consistent.
- Given the user seeks by timeline, text time control, or keyboard shortcut, when the position changes, then it is clamped to the media duration and the readout updates.
- Given focus is inside a text input or editable control, when Space is pressed, then playback does not toggle.
- Given reduced motion is enabled, when time advances, then current-time feedback remains accurate without animated transitions.
- Given waveform interaction cannot be fully provided, when the editor initializes, then labeled transport and text time controls remain usable.
- Given the timeline is used, when the draft is inspected, then no preview, final, upload, or history job has been created.

## Implementation Notes

- Added a local object-URL audio surface with deterministic waveform orientation bars, time ruler, playhead, preview-bound summary, native play/pause/mute, range seeking, numeric time seeking, and keyboard shortcuts.
- Kept waveform detail non-essential: the semantic range input, text time controls, and status messages remain usable when object URLs, duration, or browser playback are unavailable.
- Composed the timeline after validated intake and passed the selected local `File` plus media kind/duration, preserving video stream selection and the independent effect draft without creating a job.
- Verified the full suite, TypeScript, ESLint, and production build successfully.

## Design Notes

Use a calm editor card with a high-contrast playhead and a compact time ruler. The waveform is an orientation aid, not a required control: pair it with a native range input and explicit `current time / duration` text so keyboard and assistive-technology users get the same capability. Keep the source badge and “Audio timeline” heading visible for video inputs to reinforce the audio-first workflow.

## Verification

**Commands:**
- `npm test -- --run --pool=forks --maxWorkers=1 --minWorkers=1` -- expected: all tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- Load a local audio file and a video with audio, play/pause, mute, seek with the timeline and keyboard, verify text fallback and selected stream preservation, then repeat with reduced motion enabled.
