---
title: 'Story 3.1 — Create a Bounded Preview'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3be7448a8c954545ea3bd987b8869b472213786b'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The editor has a validated media/effect/output draft but no way to evaluate that exact profile before a final output job exists. Users need a short, clearly bounded local artifact that reflects the current enhancement choices without risking the source or presenting a preview as a finished export.

**Approach:** Add a typed preview request and bounded preview artifact contract, a Preview action in the validated editor, and a preview surface that records a fixed 30-second window centered on the playhead and the immutable normalized profile snapshot. Clamp the range to media boundaries. This story creates and presents the preview request boundary; progress, cancellation, failure, retry, and before/after comparison behavior remain owned by the following stories.

## Boundaries & Constraints

**Always:** Require valid media metadata and a valid normalized processing profile; preserve source reference and selected audio stream; use the existing ordered enabled stages and output semantics; keep preview processing local-only; use a 30-second maximum range centered on the playhead and clamped to media boundaries; include range, duration, profile identity/snapshot, stage/model versions, and preview artifact identity; label all preview states as Preview; keep final processing and final-output success separate; validate contracts at the boundary; support keyboard access, visible focus, text alternatives, polite announcements, color-independent status, and reduced motion.

**Never:** Upload media or telemetry; write over the source; expose preview as a final output; mutate job/history state from the UI; duplicate effect/output schemas; implement full progress, cancellation, retry, failure recovery, history persistence, or A/B comparison controls in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|-----------------------------|----------------|
| VALID_PREVIEW | Ready local media, valid profile, usable bounded range | Create a typed preview request with an immutable profile snapshot and return/open a Preview surface | Keep the editor draft unchanged |
| PROFILE_CHANGED | Existing preview plus changed effect/timeline/output setting | New request gets a new preview ID and current normalized profile; prior preview is marked stale in the UI | Never present the old artifact as current |
| RANGE_CLAMP | Playhead near a media boundary or media shorter than 30 seconds | Center a maximum 30-second window on the playhead where possible, shift/clamp it into the media duration, and show exact start/end and duration | Reject only when no usable duration exists |
| INVALID_INPUT | Missing media, invalid profile, unsupported stream, or unavailable local runtime | Do not create a preview job; show an actionable blocking message | Use typed validation/capability errors without exposing media content |
| SOURCE_PROTECTION | Preview output path would equal the source | Reject the request and retain the source reference unchanged | Use the existing immutable-source error semantics |

</frozen-after-approval>

## Code Map

- `shared/contracts/processing.ts` -- source of truth for normalized stages and output semantics; reuse it rather than creating preview-specific effect/output fields.
- `shared/contracts/media.ts` -- media identity, duration, selected stream, and validation metadata needed for preview requests.
- `features/intake/intake-panel.tsx` -- validated editor composition point; add Preview without moving media inspection or profile ownership.
- `features/editor/waveform-timeline.tsx` -- current playhead, duration, text time readout, and local playback surface; extend only as needed to expose the bounded preview selection.
- `features/editor/effect-inspector.tsx` and `features/editor/output-profile.tsx` -- existing draft controls; preserve their independent state and normalized values.
- `app/api/preview-jobs/route.ts` and `server/domain/preview-coordinator.ts` -- local typed request boundary and sole creator of prepared preview jobs; accept metadata/profile only, never media bytes.
- `tests/intake.test.tsx`, `tests/waveform-timeline.test.tsx`, and preview contract/component/route tests -- verify request normalization, range clamping, stale identity, accessibility, and no-job-on-invalid-input behavior.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/preview.ts` -- add preview request/job schemas, bounded range validation, profile snapshot metadata, and typed preview state -- establish a reusable boundary for later progress and comparison stories.
- [x] `server/domain/preview-coordinator.ts` and `app/api/preview-jobs/route.ts` -- validate requests and create preview jobs through the local boundary -- keep job ownership out of UI and keep media bytes local to the browser.
- [x] `features/editor/preview-action.tsx` and `features/editor/preview-surface.tsx` -- add the Preview action and clearly labeled bounded-preview surface -- make current range/profile identity visible without final-output language.
- [x] `features/intake/intake-panel.tsx` and `features/editor/waveform-timeline.tsx` -- wire current validated draft and bounded range into preview creation -- preserve media/effect/output ownership and keyboard behavior.
- [x] `tests/preview.test.ts`, `tests/preview-action.test.tsx`, `tests/preview-route.test.ts`, `tests/waveform-timeline.test.tsx`, and `tests/intake.test.tsx` -- cover coordinator validation, API response, valid creation, profile/playhead changes, range clamping, invalid inputs, source protection, and accessibility -- prevent unsafe or stale preview requests.

**Acceptance Criteria:**
- Given valid local media and a valid normalized profile exist, when the user selects Preview, then a typed preview request is created with a bounded range and the same ordered enabled stages, model versions, and output semantics as the profile.
- Given preview creation begins, when the preview surface opens, then it is labeled Preview and shows the exact bounded start/end, duration, and active profile summary, and does not offer final-output success language.
- Given the user changes an effect, timeline, or output setting after a preview exists, when Preview is selected again, then the new request has a new identity and current profile snapshot, and the older preview is visibly stale or historical.
- Given the requested range crosses the media boundary, when the request is normalized, then the range is clamped to the valid duration and the displayed values match the request.
- Given the playhead is near the start or end of media, when the 30-second window is calculated, then the window shifts or clamps to remain within the media while remaining no longer than 30 seconds.
- Given media, profile, stream, or runtime validation fails, when the user selects Preview, then no preview job/request is created and an actionable accessible error identifies the blocking condition.
- Given preview controls are used by keyboard or assistive technology, when the surface is opened or its state changes, then controls have labels, focus is visible, and the Preview state is announced without relying on color or motion.

## Implementation Notes

- Added a local preview-job API and coordinator; the browser sends media metadata and the normalized profile but never file bytes.
- Preview windows are at most 30 seconds, centered on the timeline playhead and shifted/clamped to the media duration. Each request snapshots the profile, selected stream, and locally detected model version.
- The coordinator blocks job creation when FFmpeg, required speech models, or writable storage are unavailable. The current repository has no preview execution worker, so this story prepares the typed job and opens its clearly labeled surface; audio processing/progress is not claimed here.
- Preview action, range-boundary, stale-profile/playhead, stream/media validation, coordinator readiness, API response, keyboard activation, and accessible announcement behavior are covered by focused tests.
- No preview execution worker exists yet. The surface states that this request is prepared and that no enhanced audio has been produced; the request cannot be used for playback until local source access and processing are implemented.
- Full verification after review fixes: focused suite 28 passed; full suite 71 passed across 14 files; typecheck, lint, and production build passed.

## Review Triage Log

| Verdict | Evidence |
|---|---|
| high — patch | Blind review: the route passed an unresolved coordinator promise into the response. Fixed by awaiting job creation and covered by a route-level 201/envelope test. |
| high — patch | Edge-case review: the route response was not awaited. Same defect as above; verified the route now awaits the coordinator and returns its parsed job. |
| high — patch | Verification-gap review: the route was untested and would not return a validated job envelope. Added a POST route test and confirmed the awaited response parses. |
| medium — patch | Blind review: changing the playhead left the old range current. Staleness now compares the current bounded range as well as the profile; added a regression test. |
| medium — patch | Edge-case review: a moved playhead could leave an obsolete range marked current. Same staleness defect; regression test covers it. |
| medium — patch | Blind review: the waveform had no sample markers. Added shaded bounds and a text readout linked to the prepared job range. |
| medium — patch | Blind review: the surface omitted stage parameter values and output semantics. It now summarizes active values and output format/quality/name. |
| low — patch | Blind review: stale preview copy said it used the current profile. Copy now says it captured the profile shown below when stale. |
| maybe-false — defer | Blind review: the new request has no readable browser-file handle or processing worker, so it cannot produce playable enhanced audio. This is confirmed for the current code, but whether playback belongs in this story is unclear because the approved scope creates a prepared request. Resolve source access and execution when implementing the preview worker; see deferred work. |
| false | Blind review: prepared-job retention could grow without bound. The coordinator no longer stores prepared jobs in a Map, so this accumulation does not occur. |
| false | Blind review: replacing media drops the old preview. Replacing the source unmounts its entire editor/request surface, so an old preview is not presented as current; cross-source preview history is outside this story. |
| medium — patch | Blind review: non-ready model capability states could pass the gate. The coordinator now requires `ready`; an `attention` state is covered by a test. |

## Design Notes

Keep Preview visually adjacent to Process in the editor’s action region. Use the waveform/timeline as the primary context, retain the local-only badge, show a calm preparation state, and make the bounded sample duration prominent. A preview artifact is a disposable evaluation result and must never be phrased as the final export.

## Verification

**Commands:**
- `npm test -- --run --pool=forks --maxWorkers=1 --minWorkers=1` -- expected: all tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- With audio and video drafts, create previews at the beginning, middle, end, and short-duration boundaries; verify exact bounds, current profile identity, source protection, accessible announcements, and no final-output affordance.
