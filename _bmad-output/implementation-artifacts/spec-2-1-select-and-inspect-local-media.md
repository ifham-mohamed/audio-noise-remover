---
title: 'Story 2.1 — Select and Inspect Local Media'
type: 'feature'
created: '2026-09-29'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '89b5743aa5fd3ed3a67d639c4d770791581dabdd'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-2-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** New enhancement is currently an empty shell, so users cannot choose a local recording or video and verify that it is usable before entering the editor.

**Approach:** Add a keyboard-accessible intake surface that accepts the supported media formats, keeps the selected source local, sends inspection through the typed local media boundary, and presents a ready media card or a stable actionable error without creating a processing job.

## Boundaries & Constraints

**Always:** Support MP3, WAV, M4A, FLAC, MP4, MOV, and MKV; show the local-only explanation and supported list; support both keyboard Browse and additive drag-and-drop; keep the original file immutable and local; use shared runtime-validated media metadata and stable error codes; show inspecting, ready, and error states with accessible status; keep video validation audio-first; allow replace/remove without losing unrelated shell/settings state; keep every primary action at least 44px and usable without hover.

**Never:** Upload media to a remote service; create a processing, preview, or history job during inspection; decode media in UI code; put FFmpeg/filesystem primitives in browser components; claim a file is ready without a usable audio stream; modify or overwrite the source; implement detailed multi-stream selection, effect controls, waveform editing, or final output behavior in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| EMPTY_INTAKE | New enhancement opens with no source | Render drop zone, Browse action, supported-format list, and local-processing explanation | N/A |
| SELECT_LOCAL_FILE | Supported File from Browse or drop | Keep the File/reference local, show `Inspecting file…`, and block editor/process actions until inspection completes | Reject remote-looking input and preserve the empty/previous safe state |
| INSPECTION_SUCCESS | Local supported media with readable audio | Show filename, audio/video type, duration, byte size, audio stream summary, and `Ready to enhance` | N/A |
| UNSUPPORTED_OR_INVALID | Unsupported extension/signature, corrupt media, or no readable audio stream | Show stable actionable error, supported formats, and Replace/Remove actions; create no job | Preserve source safety and provide diagnostics guidance when the local inspector is unavailable |
| REPLACE_OR_REMOVE | Existing ready/error media card | Replace starts a new inspection; Remove returns to empty intake and clears only the intake draft | Never mutate the source or unrelated settings |
| INSPECTION_FAILURE | Local adapter/FFmpeg unavailable or inspection request fails | Keep the selected file reference safe, show a plain-language setup/inspection error, and link to diagnostics | Do not expose stack traces, file bytes, or raw media details |

</frozen-after-approval>

## Code Map

- `app/page.tsx` -- New enhancement route; replace the empty media card with the intake composition.
- `components/app-shell.tsx` -- existing shell/local-trust surface and shared intake visual language.
- `shared/contracts/media.ts` -- supported formats, media metadata, inspection result, and stable error schemas.
- `features/intake/` -- local intake state, file selection/drop handling, inspection orchestration, and media card components.
- `app/api/media/inspect/route.ts` -- typed local inspection boundary; keep media probing behind the server/media adapter.
- `server/` and `server/ports/` -- reuse or introduce the media inspection port without importing it into UI code.
- `tests/intake*.test.tsx` and `tests/media*.test.ts` -- matrix coverage for selection, inspection, errors, and safe replacement/removal.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/media.ts` -- define supported-format constants, typed metadata, inspection states, and stable errors -- keep browser/server/media boundaries aligned.
- [x] `features/intake/` -- implement accessible Browse/drop handling, local inspection state, ready/error cards, and Replace/Remove -- make the intake workflow understandable and recoverable.
- [ ] `features/intake/media-inspection.ts` and a local browser media-probe adapter -- inspect the client-held File locally and return verified media/usable-stream metadata; keep all media bytes out of API requests. `app/api/media/inspect/route.ts` may validate only the derived typed metadata, never claim to probe the file itself.
- [x] `app/page.tsx` -- compose the intake surface with local trust copy and existing shell layout -- make New enhancement the first usable product loop step.
- [ ] `tests/intake*.test.tsx`, `tests/media*.test.ts`, and browser integration tests -- verify real supported/corrupt/no-audio inputs and prove ready is returned only after a real audio stream is found -- prevent unsafe processing states and format regressions.

**Acceptance Criteria:**
- Given New enhancement opens, when no media is selected, then the drop zone, Browse action, supported list, and local-processing explanation are visible and keyboard accessible.
- Given a supported local file is selected, when inspection begins, then `Inspecting file…` is announced, editor/process actions are unavailable, and no remote request or processing job is created.
- Given inspection succeeds, when the result renders, then filename, media type, duration, size, audio stream details, and `Ready to enhance` are shown.
- Given media is unsupported, corrupt, unreadable, or has no usable audio stream, when inspection completes, then a stable actionable error with Replace/Remove is shown and no processing job exists.
- Given Replace or Remove is selected, when the action completes, then only the intake draft changes, the original remains untouched, and a replacement starts a fresh inspection.
- Given local inspection is unavailable, when the request fails, then the user sees a plain-language diagnostic path without raw errors or media content.

## Implementation Notes

- Added shared Zod media metadata and inspection contracts for the seven supported formats, audio/video kind, stream summary, and stable inspection errors.
- Implemented local browser metadata inspection with accessible Browse/drop intake, inspecting, ready, error, replace, and remove states; no processing job is created.
- Added a local typed `/api/media/inspect` envelope boundary for validating derived metadata without coupling UI to media tooling; it does not receive media bytes or perform file probing.
- Verified 35 tests, TypeScript, ESLint, and production build successfully.
- Review finding (2026-09-30): current `inspectLocalMedia` relies on an HTML media element's metadata event and synthesizes an `audio-0` stream; the API validates submitted metadata but does not inspect media bytes. Metadata success alone does not prove a usable audio stream, especially for video. Keep this story open until a local media probe verifies the stream and the result is covered end to end.

## Spec Change Log

## Review Triage Log

- `blocking / in-progress` — Independent acceptance review found that the current browser metadata probe reports a fabricated audio stream and the API only validates the submitted metadata. This does not satisfy the requirement to reject media without usable audio. Implement a local probe behind the media boundary and test real audio, no-audio video, corrupt input, and multi-stream input before closing Story 2.1.
- `false` — A reviewer suggested adding no-audio rejection to the acceptance criteria; the frozen criteria already require a stable actionable error for media with “no usable audio stream.” The open work is implementation and real-fixture proof, so the approved acceptance text remains unchanged.

## Design Notes

The empty state should feel like a calm local workbench, not an upload dashboard. Keep the primary Browse action obvious, make the drop zone keyboard activatable, and replace it with a compact media card after selection. Use status icon + text + supporting detail so readiness and failure never rely on color alone; for video, say that an audio track was found without making video playback a prerequisite.

## Verification

**Commands:**
- `npm test -- --run` -- expected: all existing and Story 2.1 tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- Use keyboard Browse and drag-and-drop with representative supported, unsupported, malformed, and no-audio fixtures; verify local-only copy, inspecting/ready/error states, 44px actions, and that originals/settings remain unchanged.
