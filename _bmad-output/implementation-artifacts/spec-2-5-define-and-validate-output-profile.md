---
title: 'Story 2.5 — Define and Validate Output Profile'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '89e8009754fb257c57aa60b890147047e11abc83'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-2-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-2-3-configure-independent-speech-effects.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-2-4-use-waveform-timeline-and-transport-controls.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The media and enhancement draft has no explicit output contract, so users cannot review the intended container, quality, destination, or overwrite safety before a future processing job is allowed to start.

**Approach:** Add a typed output profile to the normalized processing draft and an accessible output settings panel. The panel will choose media-appropriate defaults, expose format/quality/destination/overwrite decisions, validate the profile, and show a clear readiness summary without creating a processing job.

## Boundaries & Constraints

**Always:** Keep output choices local-only and explicit; use 48 kHz WAV PCM 24-bit for audio defaults; use the source video container with AAC 192 kbps when supported and MP4/H.264/AAC as the explicit fallback; expose quality/bitrate where it applies; keep the source reference immutable and never eligible as an output target; validate and normalize at the shared contract boundary; show destination capability and overwrite state; require explicit confirmation when a target exists; preserve the media, selected stream, effects, and timeline draft; support keyboard, screen-reader, touch, visible-focus, reduced-motion, and color-independent status behavior.

**Never:** Start preview/final processing, write files, overwrite or delete anything, invoke File System Access or filesystem primitives from shared/UI contracts, silently infer an output format, or implement job progress, cancellation, retry, history, or final encoding in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| AUDIO_DEFAULT | Valid audio draft | Show WAV, 48 kHz, PCM 24-bit, quality, local destination, and overwrite settings | Keep profile valid and ready for later processing |
| VIDEO_DEFAULT | Valid video draft with selected stream | Show source-container video with AAC 192 kbps and MP4/H.264/AAC fallback | Explain unsupported source-container capability and select fallback |
| CHANGE_PROFILE | User changes format, quality, destination, or overwrite choice | Update the normalized profile and readiness summary without changing effects/media | Identify the invalid field and retain the last valid draft |
| EXISTING_TARGET | Destination reports an existing target | Show exact target name/path and an explicit overwrite warning | Block readiness until overwrite is confirmed or destination changes |
| UNSUPPORTED_DESTINATION | File System Access API is unavailable | Use browser save/download mode and offer a copyable output name/path summary | Never require arbitrary path access or fail the draft |
| SOURCE_TARGET | User attempts to use the source as output | Reject the profile and explain that originals cannot be overwritten | Keep source immutable and leave the draft editable |

</frozen-after-approval>

## Code Map

- `shared/contracts/processing.ts` -- extend the normalized processing profile with output format, codec/audio settings, quality, destination mode/target, and overwrite acknowledgement; keep Zod validation reusable by future preview/final jobs.
- `shared/contracts/settings.ts` -- reuse the existing output defaults and destination/overwrite preference vocabulary; do not duplicate incompatible defaults.
- `features/editor/output-profile.tsx` -- new client panel for media-aware format defaults, quality/bitrate controls, destination capability, conflict warning, validation summary, and accessible errors.
- `features/intake/intake-panel.tsx` -- compose the output panel after the timeline/effect draft for validated media and pass source metadata without starting work.
- `features/editor/effect-inspector.tsx` and `features/editor/waveform-timeline.tsx` -- preserve existing draft composition and controls; do not move processing or playback logic into the output panel.
- `components/settings-context.tsx` -- reuse local output preferences when available without resetting the active media draft.
- `tests/processing.test.ts` -- cover output defaults, media-aware normalization, source-target rejection, and invalid profile fallback.
- `tests/output-profile.test.tsx` and `tests/intake.test.tsx` -- cover the matrix, accessible controls, overwrite blocking, browser fallback, and validated-media composition.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/processing.ts` -- add output profile schemas, explicit audio/video defaults, destination state, and safe normalization -- create one typed boundary for future jobs.
- [x] `features/editor/output-profile.tsx` -- render media-aware output controls, capability fallback, conflict warning, and readiness summary -- make every consequential choice visible.
- [x] `features/intake/intake-panel.tsx` -- compose output settings only after validated media and pass source/media kind -- preserve existing effect/timeline state.
- [x] `tests/processing.test.ts`, `tests/output-profile.test.tsx`, and `tests/intake.test.tsx` -- cover every matrix row and acceptance behavior -- prevent unsafe output drafts.

**Acceptance Criteria:**
- Given valid audio and a draft enhancement profile exist, when the output section renders, then it shows explicit format, WAV 48 kHz PCM 24-bit defaults, quality, destination, and overwrite settings.
- Given valid video and a selected audio stream exist, when the output section renders, then it shows source-container video with AAC 192 kbps when supported and an MP4/H.264/AAC fallback when required.
- Given the user changes an output setting, when the profile is normalized, then the typed output profile and readiness summary update without changing media, effects, or timeline state.
- Given a target already exists, when the user prepares the draft for processing, then the exact target and overwrite warning are visible and readiness remains blocked until explicit confirmation or destination change.
- Given File System Access is unavailable, when the user chooses a destination, then browser save/download mode is shown and arbitrary local path access is not required.
- Given the source is selected as an output target or the profile is invalid, when validation runs, then the blocking field is identified, the original remains protected, and the draft stays editable.
- Given output settings are changed, when the draft is inspected, then no file is written and no preview, final, upload, or history job is created.

## Implementation Notes

- Extended the shared processing profile with validated media-aware output formats, 48 kHz sample-rate semantics, codec/bitrate fields, destination identity, conflict state, and overwrite acknowledgement.
- Added an accessible output panel with audio/video defaults, source-container capability fallback, browser-download fallback, target naming, explicit overwrite confirmation, source-target protection, and readiness status.
- Composed output settings only after validated local media, preserving the existing timeline/effect surfaces and creating no file, remote request, or processing job.
- Verified focused output/processing coverage plus the full test suite, TypeScript, ESLint, and production build successfully.
- Independent review (2026-09-30) confirmed the normalized profile, overwrite/source-target safety, and browser-download fallback satisfy this story's scope. Manual scenario checks remain follow-up evidence and are not recorded as performed.

## Design Notes

Place the output panel after the enhancement/timeline controls as a calm “Where should this go?” card. Use a compact format summary that distinguishes audio output from video container preservation, keep the fallback visible rather than hiding capability differences, and treat overwrite confirmation as a blocking safety state rather than a secondary note.

## Verification

**Commands:**
- `npm test -- --run --pool=forks --maxWorkers=1 --minWorkers=1` -- expected: all tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- Load audio and video media, inspect defaults, change every output control, simulate an existing target and unavailable File System Access, verify blocking/confirmation copy, and confirm no file or job is created.
