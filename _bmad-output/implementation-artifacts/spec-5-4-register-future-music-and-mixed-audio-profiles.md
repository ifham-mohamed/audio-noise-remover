---
title: 'Story 5.4 — Register Future Music and Mixed-Audio Profiles'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '811cdf34bc6b19d52d0d86a48ac4420a86ca7352'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-5-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Processing profiles and stages are currently speech-specific, preventing future enhancement types from fitting the shared pipeline contracts. Music and mixed-audio are not qualified for execution and must not be represented as available.

**Approach:** Introduce shared, runtime-validated profile and stage declarations and register the current speech profile plus unavailable music and mixed-audio profiles. Carry profile/stage identity and declared metadata through existing editor, job, progress, history, cancellation, retry, and output contracts without creating a second lifecycle or activating unqualified processing.

## Boundaries & Constraints

**Always:** Preserve the existing speech defaults, stage order, parameter meaning, and supported execution path. A declaration describes media support, ordered stage parameters, required capabilities, adapter IDs, and metrics; it does not establish runtime availability or model qualification. Unavailable profiles and stages must have clear reasons, cannot be activated or submitted for execution, and must not be silently normalized into speech defaults. Keep profile snapshots serializable and runtime-validated through shared TypeScript/Zod contracts. Reuse the existing coordinator-owned job states and generic progress/cancel/retry/history/output behavior.

**Never:** Add a music/mixed model, enable unqualified adapters, claim output quality, introduce profile-specific job/history states, infer capability from a registration, weaken current speech validation, or add remote processing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SPEECH_PROFILE | Existing speech profile and fixtures | Same canonical enabled stages, defaults, normalization, and execution eligibility | Existing validation errors remain stable |
| FUTURE_UNAVAILABLE | Music or mixed-audio registration without a qualified local adapter | Profile and its ordered stages are visible as unavailable with an actionable explanation; cannot be selected for processing | Job creation fails closed with a stable unsupported/unavailable response |
| EXTENDED_SNAPSHOT | Valid registered profile snapshot passes shared job lifecycle | IDs, ordering, parameters, and declared labels survive progress, cancel, retry linkage, history, and output metadata unchanged | Unknown/malformed stage or undeclared profile is rejected |

</frozen-after-approval>

## Code Map

- `shared/contracts/processing.ts` -- current effect ID discriminated union, parameter schemas, defaults, and `normalizeProcessingProfile`; currently normalizes only known speech stages.
- `features/editor/effect-inspector.tsx` -- hard-coded speech labels, parameter widgets, and ordered summary; retain speech controls and render unavailable future choices/stages without implying they can run.
- `features/preview/preview-worker.ts` and `features/final/final-worker.ts` -- actual speech-only execution adapters; keep their support checks explicit and fail-closed for unimplemented stages.
- `shared/contracts/preview.ts`, `shared/contracts/final-job.ts`, `server/domain/preview-coordinator.ts`, and `server/domain/final-job-coordinator.ts` -- profile snapshots and generic lifecycle/progress/cancellation/retry contracts; extend only as needed for safe typed profile identity.
- `features/history/history-view.tsx` and `features/editor/preview-surface.tsx` -- profile/stage display currently includes speech-specific formatting; consume registered labels/parameter metadata with safe fallbacks.
- `tests/processing.test.ts`, `tests/effect-inspector.test.tsx`, `tests/preview.test.ts`, `tests/final-job.test.ts`, and history tests -- preserve speech regression coverage and add unavailable-profile, snapshot, and fail-closed cases.
- Most recent Epic 5 continuity: `spec-5-3-clean-up-generated-files-and-history-safely.md` records coordinator ownership, cross-store verification, exact cleanup outcomes, and story test conventions.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/processing.ts` and a shared profile registry module -- define strict serializable profile/stage metadata and validate declarations, ordered parameters, media kinds, requirements, adapter IDs, and metrics.
- [x] Shared profile registrations -- register speech unchanged; add music and mixed-audio declarations with unavailable status and actionable reasons; distinguish declared support from detected/qualified execution support.
- [x] `features/editor/effect-inspector.tsx` and display helpers -- derive stage labels/parameter descriptions from declarations and expose future entries read-only/unavailable while keeping existing speech actions unchanged.
- [x] Preview/final shared job contracts, coordinators, progress and history summaries -- preserve generic profile snapshots, labels, stage order, and retry/cancellation semantics; reject unavailable/unknown profiles before execution.
- [x] Focused contract, UI, worker, coordinator, history, and end-to-end tests -- verify speech regression, future declaration round-trip, unsupported fail-closed behavior, and no lifecycle special cases.

**Acceptance Criteria:**
- Given a valid profile declaration, when it is registered, then shared contracts can represent its media support, ordered stages, parameter definitions, capabilities, adapters, and metrics without profile-specific job/history states.
- Given music or mixed-audio has no qualified local adapter, when profile choices or stages are displayed, then they are visibly unavailable with an actionable explanation and cannot start processing.
- Given a job snapshot uses a registered supported profile, when progress, cancellation, retry, history, and output flows consume it, then declared profile/stage identity and order remain intact.
- Given the existing speech fixtures run, when the registry is introduced, then existing defaults, interpretation, editor behavior, and execution eligibility are unchanged.

## Implementation Notes

Investigation confirmed the editor normalizer rebuilt four speech stages and the preview/final workers execute only explicit speech paths. Added a shared Zod registry for speech, music, and mixed-audio with per-stage labels, parameters, capabilities, adapter IDs, metrics, media kinds, and qualification state. The editor shows future profiles and stages as informational unavailable cards. Profile IDs persist through preview/final snapshots and job/history labels resolve from the registry; preview/final creation rejects unavailable profiles before lifecycle state is created. Workers remain explicit speech-only allowlists. Speech defaults/order and the experimental execution restriction remain unchanged.

Verification performed after review fixes: all 199 unit/component/API tests pass; TypeScript typecheck, lint, production build, focused Playwright profile check (`tests/e2e/profile-registry.pw.ts`), and `git diff --check` pass. The user's `next-env.d.ts` change is preserved and excluded from this story.

## Spec Change Log

## Review Triage Log

- medium / patch -- Blind review found the shared processing stage schema remained limited to speech IDs; registered profile snapshots now accept declared stage IDs and validate them against profile metadata while execution adapters remain speech-only.
- medium / patch -- Blind review found editor parameter bounds and labels were hard-coded; controls now derive ranges, steps, units, and labels from the registered stage parameter declarations.
- medium / patch -- Blind review found duplicate parameter declarations could make profile lookup ambiguous; profile validation now rejects duplicate parameter IDs.
- medium / patch -- Blind review found duplicate profile IDs could shadow registrations; registry validation now rejects duplicate IDs.
- medium / patch -- Blind review found history's global stage-label mapping could mislabel same-named stages across profiles; history now resolves labels and parameters within the job's profile.
- false -- Blind review proposed requiring `requiredCapabilities` to equal `adapterId`; these fields describe separate declared constraints (runtime capabilities versus adapter identity), so equality would reject valid profiles and is not required by the contract.
- medium / patch -- Blind review found an available but unqualified profile could pass registry validation; declarations now enforce the availability/qualification relationship, and creation remains fail-closed.
- false -- Blind review reported unknown profile IDs were mapped to `MODEL_UNAVAILABLE`; runtime schema parsing first rejects unregistered profiles as `INVALID_PROFILE`, before availability checks.
- medium / patch -- Edge review repeated the available/unqualified declaration finding; the same schema guard and fail-closed creation path address it.
- medium / patch -- Edge review found media-kind support was not checked when creating jobs; preview and final job creation now reject media kinds not declared by the selected profile.
- medium / patch -- Edge review found empty capability/metric lists and duplicate parameter IDs were accepted; declarations now validate non-empty requirements/metrics and unique parameter IDs.
- medium / patch -- Edge review repeated that generic registered snapshots could not pass shared lifecycle contracts; contract schemas now validate declared extension stages without enabling their execution.
- medium / patch -- Edge review repeated hard-coded editor parameter ranges; editor widgets are declaration-driven.
- medium / patch -- Edge review found history filters and stage names used incompatible identifiers; filters now use profile IDs and stage summaries resolve profile-specific labels.
- low / patch -- Edge review found stage labels were lowercased in final-job progress; the view now preserves registry display casing and its regression test asserts it.
- false -- Edge review requested a UI submission E2E for unavailable profiles; the UI renders future profiles as informational, non-selectable cards with no submit action. Contract/coordinator tests assert rejected creation and no job is queued, while the browser check confirms no future-profile controls appear.
- medium / patch -- Verification review found the history profile/stage label path lacked an assertion; history tests now assert the resolved `Speech · Noise removal, Voice clarity` summary.

## Design Notes

Keep declarations, availability, and execution qualification separate. Speech remains the only active profile in the current app. Future declarations may be inspected and safely serialized, but no coordinator may enqueue unavailable work; execution adapters remain explicit allowlists. Progress/history can render generic IDs and declared labels without assuming a particular audio effect parameter.

## Verification

**Commands:**
- `npm test` -- all unit/component/API tests pass, including unchanged speech fixtures and new registry/flow coverage.
- `npm run typecheck` -- success without unsafe type widening.
- `npm run lint` -- success.
- `npm run build` -- success; preserve and exclude the user's `next-env.d.ts` modification.
- `npx playwright test <focused profile/editor/history specs>` -- browser verifies unavailable profiles are understandable and cannot run while speech remains usable.

**Manual checks:**
- Confirm music/mixed-audio declarations are clearly unavailable, no action enables them, and speech controls/defaults render exactly as before.
