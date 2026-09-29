---
title: 'Story 3.3 — Compare Before and After Preview Audio'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ecf5af868056ab22054956f1b7cd74bddd8d6fc3'
context:
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-3-2-show-preview-progress-cancellation-and-failure.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.2 can produce a bounded enhanced preview artifact, but users cannot compare it with the exact source audio segment that produced it. The existing timeline plays the whole source file and cannot reliably play a selected audio stream from video.

**Approach:** Add an inline comparison workspace for a successful preview with Before, After, and A/B controls, shared seek position, transport and mute controls, paired waveform state, visible preview bounds, and accessible status. Retain the decoded source segment from the preview worker beside the enhanced artifact so audio and video comparisons use the same selected stream and exact bounded range. Label both as preview comparison; keep model output marked experimental.

## Boundaries & Constraints

**Always:** Keep media and both audio artifacts in the browser and local IndexedDB; send artifact metadata only through the coordinator. Compare identical bounded source and enhanced segments at a shared relative playhead. Revoke local object URLs and stop playback when the comparison changes or unmounts. Keep source audio explicitly labeled Before, enhanced audio After, and successful preview distinct from final output. Support keyboard, screen-reader announcements, visible focus, reduced motion, and text time/bounds independently of waveform visuals.

**Never:** Upload media or audio bytes; replay the full video/file as a substitute for its selected extracted audio stream; play Before and After simultaneously as the A/B method; mutate preview lifecycle from the comparison UI; change enhancement, retry, or cancellation behavior; treat an experimental model result as production-qualified.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| READY_PAIR | Succeeded preview with retained source and enhanced artifacts | Load and validate both local artifacts; expose comparison controls at the preview range | Keep controls unavailable and offer rerun guidance if either artifact is missing |
| MODE_SWITCH | Before, After, or A/B selected while paused/playing | Change audible side at the same relative time; preserve play state and show the active side in text | Handle autoplay rejection with an actionable local playback message |
| SEEK_SYNC | Seek by slider, time entry, or keyboard | Clamp to the preview duration and synchronize both media elements; display source bounds and relative time | Ignore non-finite input and keep a valid current position |
| SOURCE_CHANGE | File, selected stream, job, or artifact changes during artifact loading/playback | Stop old playback, discard late loads, and release both old object URLs | Do not attach a stale artifact to the new source/job |
| MISSING_PAIR | Legacy or expired preview has no retained source artifact | Explain that comparison data is unavailable and allow a new preview attempt | Never substitute decoded source audio for the enhanced side |

</frozen-after-approval>

## Code Map

- `shared/contracts/preview.ts` -- add optional `comparisonSourceArtifact` metadata to successful preview jobs/events for backward-compatible persisted jobs; media bytes remain local.
- `features/preview/preview-worker.ts` -- preserve the existing selected-stream, bounded FFmpeg decode as the Before WAV; pair its local Blob with enhanced output.
- `features/preview/preview-worker-client.ts` and `features/preview/preview-artifact-store.ts` -- atomically validate/retain the source and enhanced WAV pair, roll back partial storage, reopen by ID, and revoke object URLs.
- `server/domain/preview-coordinator.ts` -- persist only source-artifact metadata from the succeeded event; preserve existing job state ownership.
- `features/editor/preview-comparison.tsx` (new) -- own local artifact loading, two media elements, shared transport/time, Before/After/A-B controls, and cleanup.
- `features/editor/preview-surface.tsx` -- show the comparison only for the latest successful, current preview and its bounds; preserve existing source timeline and profile ownership.
- `tests/preview-comparison.test.tsx`, worker/artifact/coordinator tests, and `tests/e2e/application-keyboard.pw.ts` -- cover audio/video stream pair, synchronization, races, cleanup, accessibility, and actual browser comparison.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/preview.ts`, `server/domain/preview-coordinator.ts` -- persist paired-source artifact metadata on success while reading prior jobs with no pair.
- [x] `features/preview/preview-worker.ts`, `preview-worker-client.ts`, `preview-artifact-store.ts` -- create Before from the selected decoded preview range and retain/reopen it atomically with After.
- [x] `features/editor/preview-comparison.tsx` -- implement local paired playback, shared seek/mute, mode switching, accessible status, and lifecycle cleanup.
- [x] `features/editor/preview-surface.tsx` -- present comparison only for the matching successful preview and expose paired waveform/time/bounds state.
- [x] Unit and browser tests -- verify audio and selected video stream pairing, synchronization, A/B switching, missing/expired artifacts, stale-load races, URL cleanup, keyboard, screen-reader text, and reduced motion.

**Acceptance Criteria:**
- Given a successful preview has both retained artifacts, when its comparison renders, then Before, After, and A/B controls, synchronized position, preview bounds, time readout, and active waveform state are visible and text-labeled.
- Given the user selects Before, After, or A/B during playback, when the audible side changes, then playback continues at the same bounded relative time and the selected side/mode is announced.
- Given the user seeks or mutes with keyboard or labeled controls, when the control changes, then both sides remain synchronized, time stays within preview bounds, and no canvas interaction is required.
- Given the source is audio or video with a selected stream, when comparison plays Before, then it uses the same decoded stream and exact bounded segment used for enhancement.
- Given artifacts expire, fail to load, or become stale during a source/job change, when the comparison is unavailable, then playback stops, URLs are released, and no wrong or source-as-enhanced result is shown.
- Given reduced motion is enabled, when playhead and active-side indicators update, then motion is reduced while timing and textual state remain accurate.

## Implementation Notes

Before audio is emitted from the exact canonical WAV decoded for the selected stream and bounded range. The worker sends both WAV blobs only to the browser client; one IndexedDB transaction validates and retains the pair before metadata-only coordinator success. The comparison opens each local artifact, synchronizes both elements on a relative playhead, plays exactly one side, marks the experimental After result, and releases URLs/stops playback on pair changes or unmount. Current successful preview state is the only state that mounts the comparison; stale profiles and legacy jobs without a source pair receive rerun guidance.

The comparison status live region announces the selected side/mode, not each frequent playback time update; the seek slider and visible time readout expose position without repetitive announcements.

## Design Notes

A/B is a sequential switch between Before and After at one relative playhead; it never mixes both tracks simultaneously. The retained Before segment ensures video stream selection and range boundaries match the enhancement input. Keep the source timeline and comparison controls local to the current media card.

## Verification

**Commands:**
- `npm test` -- expected: comparison, coordinator, worker, artifact, and UI tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run test:e2e` -- expected: browser comparison passes for audio and a selected video audio stream, including seek, mode changes, cleanup, and accessibility.

Automated checks pass. A human-observed screen-reader playback walkthrough has not been recorded; the status text and keyboard controls are covered by automated tests, but spoken timing/mode announcements remain a manual review item.

## Review Triage Log

| Finding | Verdict | Evidence and disposition |
|---|---|---|
| Seeking tests did not assert both audio positions. | medium | The implementation sets both `currentTime` values, but prior tests only asserted the displayed slider/readout; a regression removing synchronization would pass. Added Before/After position assertions for direct and clamped seeking. `patch` |
| A mode-switch playback promise can settle after the active side changes. | medium | Overlapping transitions could let an older `play()` rejection alter the current state. Added sequence guards and a deferred-promise regression test. `patch` |
| A second review independently reported the same out-of-order playback-promise race. | medium | Same transition race and same fix as the edge-case finding above; retained as a separate reviewed claim. `patch` (same root-cause group) |
| Numeric time-entry typing was overwritten by immediate rounding. | medium | Separated editable text from playback position; valid time commits on blur/Enter, preserving decimals. Added decimal, clamp, and invalid-value tests. `patch` |
| Paired artifacts could accumulate up to 0.10 seconds of range drift. | medium | The coordinator now validates each artifact directly against the bounded range; the job contract enforces the same constraint. Added a tolerance-boundary regression test. `patch` |
| Failed/cancelled jobs could validate with comparison-source metadata. | low | Added a schema invariant requiring comparison-source metadata to accompany a successful enhanced artifact; coordinator terminal transitions already clear both. `patch` |
| A coordinator success event could omit the source pair. | medium | New coordinator success transitions now reject missing Before metadata; legacy succeeded job records remain readable without it. Added coverage for both paths. `patch` |
| Video-stream test did not separately inspect Before waveform contents. | false | The worker creates Before from the exact `decoded` buffer returned after selected-stream FFmpeg mapping. The MKV fixture has unsupported AC-3 on stream 0 and AAC on stream 1; browser tests prove stream 0 fails while selecting stream 1 succeeds. This disproves the claim that the current test would pass for the wrong stream under the actual implementation. |
| Reduced-motion behavior lacked a comparison-specific check. | false | The comparison indicators and playhead update without custom movement animations; the browser comparison test now runs with reduced motion emulated and verifies computed transition/animation durations are reduced to at most 0.001 seconds. |
| Keyboard mode/mute coverage used pointer clicks. | false | Updated browser coverage to focus the Before/After and A/B buttons and activate them with Enter; mute is focused and activated with Space. |
| Sprint status did not match the spec’s review state. | low | Updated Story 3.3 from `in-progress` to `review`; spec and tracker now agree. `patch` |
