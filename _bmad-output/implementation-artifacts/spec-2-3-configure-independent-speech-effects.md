---
title: 'Story 2.3 — Configure Independent Speech Effects'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ed6e51c5fc37a8fa32c497dbed2a1c1bd2980ba5'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-2-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-2-2-review-media-card-and-video-audio-stream.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The validated media flow has no way for users to control speech enhancement stages independently, so the future processing profile cannot be reviewed or reproduced.

**Approach:** Add a speech effect inspector with four separate cards in explicit pipeline order, typed parameters, accessible controls, capability states, reset behavior, and a normalized profile summary. Defaults are explicit: noise removal and voice clarity start enabled at moderate intensity; loudness normalization and echo/reverb reduction start disabled.

## Boundaries & Constraints

**Always:** Keep noise removal, voice clarity, loudness normalization, and echo/reverb reduction independently switchable; expose a plain-language explanation, enabled state, parameter/value/unit, reset action, and capability state for every card; show the exact ordered pipeline and omit disabled stages from normalized profile output; validate parameters at the shared contract boundary; keep CPU-safe execution as the baseline and prevent activation when a required capability is unavailable; preserve local-only processing, immutable media, selected audio stream, accessibility, and no job creation; keep defaults visible and reviewable.

**Never:** Combine stages behind an opaque “AI enhancement” control; run disabled stages with hidden defaults; upload media or invoke FFmpeg/ONNX/filesystem primitives from React; create preview/final processing/history jobs; implement waveform/transport, output configuration, cancellation, retry, or final model inference in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DEFAULT_PROFILE | Valid local media ready | Show four independent cards; noise removal and voice clarity enabled, loudness and echo/reverb disabled; summary lists only enabled stages | Keep profile valid without starting a job |
| TOGGLE_STAGE | User enables/disables a card | Update card state and normalized ordered stage list immediately | Disabled stages disappear from “What will run” |
| CHANGE_PARAMETER | User changes intensity or loudness target | Show current value/unit accessibly and update summary/profile parameters | Reject or clamp out-of-range values with a plain-language explanation |
| RESET_STAGE | User chooses Reset | Restore that stage’s explicit default without changing other cards | Preserve selected media and other stage settings |
| CAPABILITY_UNAVAILABLE | Required model/runtime capability unavailable | Mark the affected card unavailable, explain why, and prevent unsafe activation | Keep CPU-safe alternatives enabled where supported and link to diagnostics |
| INVALID_PROFILE | Draft state contains malformed or stale values | Normalize only valid enabled stages in canonical order | Do not enqueue work; expose a safe validation message |

</frozen-after-approval>

## Code Map

- `shared/contracts/processing.ts` -- add Zod schemas for stage ids, parameters, capability state, ordered processing profiles, and normalization; become the shared browser/server profile boundary.
- `features/editor/effect-inspector.tsx` -- implement four independent accessible effect cards, reset/toggle/parameter actions, capability messaging, and the pipeline summary.
- `features/intake/intake-panel.tsx` -- compose the effect inspector after a validated media review and pass the selected media reference/stream into the draft editor state.
- `shared/contracts/capabilities.ts` -- reuse stable capability statuses/codes for unavailable model and CPU-limited messaging without exposing diagnostics internals.
- `tests/processing.test.ts` -- validate defaults, parameter bounds, canonical ordering, and omission of disabled stages.
- `tests/effect-inspector.test.tsx` -- cover independent controls, accessible values, reset, capability blocking, and summary updates.
- `tests/intake.test.tsx` -- verify the effect inspector is only available after media validation and does not create a job.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/processing.ts` -- define effect ids, parameter schemas, explicit defaults, capability state, and normalized profile output -- keep stage contracts reusable by preview and final jobs.
- [x] `features/editor/effect-inspector.tsx` -- render independent cards with switches, controls, explanations, reset actions, capability state, and ordered summary -- make every stage reviewable.
- [x] `features/intake/intake-panel.tsx` -- attach the inspector to the validated media flow -- preserve local media/stream state and block it for invalid intake.
- [x] `tests/processing.test.ts`, `tests/effect-inspector.test.tsx`, and `tests/intake.test.tsx` -- cover every matrix row and acceptance behavior -- prevent unsafe or opaque profiles.

**Acceptance Criteria:**
- Given valid media is loaded, when the editor renders, then it shows four independent effect cards in the order noise removal, voice clarity, loudness normalization, and echo/reverb reduction.
- Given an effect card is rendered, then it includes an accessible enabled switch, plain-language explanation, reset action, capability state, and parameter control where applicable.
- Given the user disables an effect, when the profile is normalized, then that stage is omitted from the ordered pipeline and the summary shows what remains.
- Given the user changes a parameter, when the value changes, then its value and unit are announced accessibly and the pipeline summary updates without changing other stages.
- Given the user resets a stage, when reset completes, then only that stage returns to its explicit default.
- Given a required model or capability is unavailable, when the card renders, then activation is prevented with a plain-language explanation and CPU-safe alternatives remain available where supported.
- Given any effect control is changed, when the draft is inspected, then no processing, preview, upload, or history job has been created.

## Implementation Notes

- Added shared Zod processing-stage contracts with explicit defaults, bounded parameters, capability state, canonical ordering, and safe stale-profile fallback.
- Added an accessible four-card speech effect inspector with independent switches, sliders, LUFS target, reset actions, capability messaging, and a live “What will run” summary.
- Composed the inspector only after validated local media is ready, preserving selected media/stream state and creating no job or remote request.
- Verified 45 tests, TypeScript, ESLint, and production build successfully.

## Spec Change Log

## Review Triage Log

## Design Notes

Use the editor’s effect stack as a quiet inspector rather than a dashboard: one card per stage, muted styling for disabled stages, a visible teal focus/selection edge, and a compact “What will run” list that names the exact ordered stages. Values should read as human settings (`60% intensity`, `-16 LUFS`, `40% reduction`) while the normalized contract stores typed numeric parameters.

## Verification

**Commands:**
- `npm test -- --run` -- expected: all tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- Load valid media, toggle each stage independently, edit/reset parameters, inspect the ordered summary, and simulate unavailable model capability; verify keyboard labels, touch-sized controls, unchanged media/stream selection, and no job creation.
