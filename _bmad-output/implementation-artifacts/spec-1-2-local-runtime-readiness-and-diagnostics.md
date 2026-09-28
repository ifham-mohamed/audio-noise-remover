---
title: 'Story 1.2: Local Runtime Readiness and Diagnostics'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
baseline_commit: '055fe781f9f2605a273ce831092cf048270aa9e1'
review_loop_iteration: 0
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-1-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/spec-1-1-local-application-shell-and-navigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The shell currently tells users that processing is local but cannot tell them whether the local runtime is ready. Users need a trustworthy readiness view before selecting or configuring media.

**Approach:** Add a typed local capability contract, a server-side diagnostics boundary, and a Settings diagnostics surface that reports runtime readiness in plain language while preserving draft editing when a non-fatal capability is unavailable.

## Boundaries & Constraints

**Always:** Detect and report FFmpeg readiness/version, model availability/version/license when discoverable, CPU or accelerator provider, writable local storage, available disk space, operating system, architecture, and browser capabilities. Keep diagnostics local, expose only safe summaries, identify CPU as the safe fallback, and use stable status/error codes across the server boundary.

**Never:** Upload media or diagnostics, inspect media bytes, run processing, download models automatically, expose secrets or raw command output, silently claim a capability is ready, or block media selection/draft editing solely because an optional accelerator or model is unavailable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| READY | All required local checks pass | Settings shows `Ready`, versions/providers, writable storage, free space, OS, and browser capability summary | N/A |
| CPU_FALLBACK | No supported accelerator is detected | Settings identifies CPU processing as the safe path and keeps supported capabilities usable | Do not present missing acceleration as a fatal error |
| MISSING_CAPABILITY | FFmpeg, model asset, storage permission, or required runtime check is unavailable | Local badge/diagnostics show `Local setup needs attention`, name the capability, and give the next safe action | Use stable code and user-safe details; retain draft/media selection |
| LOW_STORAGE | Available disk space is below the configured safety threshold | Diagnostics warns before processing and directs the user to cleanup/settings | Do not write media or create a processing job |
| COPY_REPORT | User requests a diagnostic report | Clipboard receives a redacted report with safe environment, capability, version, and status details | If clipboard access is unavailable, offer a selectable text fallback |
| BROWSER_LIMIT | Browser lacks an optional capability such as directory access | Diagnostics marks the capability as limited and describes the supported fallback | Do not imply arbitrary local path access is available |

</frozen-after-approval>

## Code Map

- `components/app-shell.tsx` -- reuse the existing trust badge and shell route; add readiness-aware state/link behavior without coupling it to detection internals.
- `app/settings/page.tsx` -- replace the placeholder with the local processing diagnostics surface and redacted-copy action.
- `shared/contracts/capabilities.ts` -- add the Zod-validated capability/readiness result, item statuses, stable codes, and diagnostic report contract.
- `server/ports/capability-detector.ts` -- define the port for runtime, filesystem, media-tool, model, and browser capability checks.
- `server/adapters/capability-detector.ts` -- implement safe local checks for OS/architecture, FFmpeg, model manifest, writable storage, disk space, and server-visible runtime details; never return raw command output.
- `app/api/capabilities/route.ts` -- expose the typed `{ data, error, requestId }` local diagnostics boundary and safe failure envelope.
- `components/diagnostics-panel.tsx` -- render grouped status cards, CPU fallback messaging, actionable attention copy, and accessible report copying.
- `tests/capabilities.test.ts` and `tests/diagnostics-panel.test.tsx` -- cover ready, CPU fallback, missing capability, low storage, redaction, and browser limitation cases.
- `package.json` -- add only the smallest script/dependency boundary needed for the local diagnostics contract; do not introduce a remote service.

## Tasks & Acceptance

**Execution:**

- [x] `shared/contracts/capabilities.ts` -- define and validate capability/status/error/report schemas -- keep server/UI data stable and redacted.
- [x] `server/ports/capability-detector.ts` and `server/adapters/capability-detector.ts` -- implement local checks with CPU fallback, safe version summaries, writable-storage and free-space reporting -- make readiness honest across platforms.
- [x] `app/api/capabilities/route.ts` -- provide the local diagnostics endpoint with request ID and stable error envelope -- preserve the application boundary.
- [x] `components/diagnostics-panel.tsx`, `app/settings/page.tsx`, and `components/app-shell.tsx` -- show grouped readiness states, actionable attention messaging, and a copy-diagnostics flow -- make runtime status understandable and reachable.
- [x] `tests/capabilities.test.ts` and `tests/diagnostics-panel.test.tsx` -- verify the I/O matrix, redaction, keyboard labels, and no media/secret leakage -- prevent unsafe diagnostics regressions.

**Acceptance Criteria:**

- Given the application starts locally, when capability detection completes, then Settings reports FFmpeg readiness/version, model availability/version when discoverable, CPU or accelerator provider, writable storage, available disk space, operating system, architecture, and browser capabilities.
- Given acceleration is unavailable, when diagnostics render, then the CPU-safe path is explicitly identified and supported local editing remains usable.
- Given a required capability is unavailable, when the user opens the trust badge or Settings, then the UI says `Local setup needs attention`, identifies the unavailable capability, and gives an actionable next step without discarding the draft or blocking media selection.
- Given storage is low or the local output area is not writable, when diagnostics render, then the UI explains the risk before processing and offers a safe settings or cleanup route.
- Given the user copies diagnostics, when the report is created, then it contains request/runtime/capability summaries but excludes media bytes, raw audio, full file contents, command output, paths that reveal secrets, and secret values.
- Given an optional browser feature is unavailable, when diagnostics render, then the limitation and supported fallback are stated without claiming unsupported local path behavior.
- Given a screen reader or keyboard user opens diagnostics, when statuses and actions are presented, then each status has text, an accessible label, visible focus, and a copy fallback that does not require hover.

## Implementation Notes

- Added Zod-validated capability contracts and a local diagnostics API envelope with request IDs and stable capability codes.
- Implemented safe local detection for FFmpeg, model manifest availability, writable storage/free space, OS/architecture, and CPU/optional acceleration state. Command output is parsed to a version summary and never returned raw.
- Added browser-side capability enrichment for directory access, audio, media playback, and clipboard support, including a selectable report fallback when clipboard access is unavailable.
- The live endpoint reports this environment honestly: FFmpeg and the speech model manifest are currently unavailable, storage is writable, and CPU-safe processing is available.
- Verification completed with `npm test -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, and a live `GET /api/capabilities` check returning HTTP 200.
- Review fixes added explicit checking/attention trust states, response-schema validation, visible runtime metadata, write-probe cleanup, FFmpeg version verification, browser API function checks, error/retry messaging, report sanitization, and coverage for shell readiness and browser enrichment.

## Design Notes

Use the existing Clearwave token layer and shadcn conventions. Group diagnostics by `Runtime`, `Media tools`, `Models`, `Storage`, and `Browser`; use text labels (`Ready`, `Needs attention`, `Unavailable`) in addition to color. Keep technical details behind an expandable disclosure while making the next action visible in the primary card.

## Verification

**Commands:**

- `npm test -- --run` -- expected: capability and diagnostics tests pass.
- `npm run typecheck` -- expected: TypeScript completes with no errors.
- `npm run lint` -- expected: lint completes with no errors.
- `npm run build` -- expected: production build completes and the diagnostics route is included.

**Manual checks:**

- Open Settings at desktop and mobile widths; verify readiness grouping, CPU fallback copy, keyboard focus, screen-reader labels, and redacted copy behavior.
- Temporarily make a capability unavailable in the detector fixture and confirm the shell trust state changes without losing the current draft.

## Review Triage Log

- `medium / patch` — Runtime OS, architecture, and Node version were present in the report but not rendered; the diagnostics panel now shows a visible runtime summary.
- `false` — A separate configured output-directory check was not applicable because this story has no output-path configuration or output destination contract; it reports the application’s local writable storage boundary as specified.
- `low / patch` — Directory read/write access alone did not exercise actual writes; the detector now performs and cleans up a temporary write probe.
- `false` — Model artifact loadability is not part of this story’s approved contract; the detector reports discoverable local model-manifest availability while model adapters remain future work.
- `false` — `actionLabel` is intentionally plain-language next-step guidance because setup and cleanup destinations are not implemented by this story; no speculative route was added.
- `medium / patch` — Diagnostics refresh failures had no visible recovery state; the panel now shows an alert and keeps browser diagnostics plus Refresh available.
- `medium / patch` — The trust badge initially presented `On this device` while detection was pending; it now says `Checking local readiness` until a validated result arrives.
- `high / patch` — Manifest-derived values could flow into copied diagnostics without redaction; license values are constrained and report fields are sanitized before copying.
- `medium / patch` — Client capability responses were manually cast; AppShell and DiagnosticsPanel now validate the typed API envelope and reject non-OK or missing-data responses.
- `medium / patch` — Browser diagnostics disappeared when the server request failed; browser capabilities are now detected independently and remain visible with the error state.
- `medium / patch` — The original tests did not cover readiness mapping, error fallback, browser enrichment, runtime rendering, or write-probe behavior; focused tests now cover those paths.
- `low / patch` — An undefined-but-present browser API could be treated as supported; capability checks now require callable functions and include a regression test.
- `low / patch` — FFmpeg success without a recognizable version line could be marked ready; the detector now treats unverifiable versions as unavailable.
- `medium / patch` — Shell readiness mapping lacked an assertion at the consumer boundary; AppShell tests now cover attention and failed-response states.
- `medium / patch` — Browser enrichment was only indirectly represented by a fixture; DiagnosticsPanel tests now exercise the merge function and browser fallback behavior.
- `medium / patch` — The diagnostics endpoint failure path lacked user-visible handling; the panel now exposes a recoverable alert and retry action.

No findings were deferred.
