---
title: 'Story 1.3 — Appearance, Playback, Output, and Accessibility Settings'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9414f7181c84f4def9466241b6a03dc57a49f3fe'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-1-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/ux-designs/ux-ai-noice-removal-2026-09-29/EXPERIENCE.md'
---

## Intent

**Problem:** The Settings route is currently a placeholder, so users cannot make the local workspace match their visual, playback, output, privacy, or accessibility needs.

**Approach:** Replace the placeholder with a grouped settings experience backed by locally persisted preferences. Changes apply immediately to the shell and future editor flows without clearing the active draft or job, and destructive cleanup actions require exact-scope confirmation.

## Boundaries & Constraints

**Always:** Keep preferences local-only and typed at the storage boundary; preserve immutable originals and active draft/job state; expose a visible label, concise explanation, current value, and keyboard-accessible control for every setting; honor reduced motion and high-contrast waveform preferences; use the planned output defaults of 48 kHz WAV PCM 24-bit for audio and source-container video with AAC 192 kbps when supported, with MP4/H.264/AAC fallback; retain successful outputs until the user removes them and make previews older than seven days eligible for cleanup; provide a File System Access destination when available and a save/download fallback with copyable output path; announce meaningful state changes through the existing accessibility contract.

**Never:** Send settings or media to a cloud service; store media bytes in preferences; modify originals; overwrite an existing output without the configured explicit confirmation decision; clear files, history, or metadata without an exact-scope confirmation; make settings changes reload the page or cancel an active job; silently introduce final model, GPU, or desktop-packaging decisions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Settings loads with no saved preferences | Render grouped Appearance, Playback, Output, Local processing, Privacy and cleanup, and Accessibility sections with documented defaults | N/A |
| APPEARANCE_CHANGE | User changes system/dark/light, density, reduced motion, or waveform contrast | Shell updates immediately; active draft/job remains intact; preference is persisted locally | Invalid or unavailable stored value falls back to the documented default and remains editable |
| PLAYBACK_CHANGE | User changes seek interval, autoplay preview, shortcut behavior, or announcement verbosity | Future playback/editor behavior uses the new value without interrupting current work | Keep the last valid value when storage is unavailable |
| OUTPUT_CHANGE | User selects format/quality, destination, or overwrite preference | New output jobs use the preference; destination picker is used when supported, otherwise browser save/download and Copy output path are available | Explain fallback or unavailable destination access; never silently overwrite |
| CLEANUP_CONFIRMATION | User chooses previews, generated outputs, history metadata, or all eligible local data | Show exact-scope confirmation; perform only the confirmed cleanup and leave originals untouched | Cancel leaves all data unchanged; report partial failure and offer retry |
| CORRUPT_STORAGE | Stored settings are missing, malformed, or from an older shape | Use safe defaults, preserve the rest of the page, and rewrite only after a valid user change | Do not throw a render-blocking error; expose a non-blocking recovery notice if useful |

## Code Map

- `app/settings/page.tsx` -- route composition for the complete settings and diagnostics surface.
- `components/app-shell.tsx` -- shell theme, density, motion, and trust-state consumers.
- `components/diagnostics-panel.tsx` -- existing local-runtime status that remains visible in Local processing.
- `components/ui/` -- reusable shadcn-style controls; add only the primitives needed by the settings surface.
- `shared/contracts/settings.ts` -- typed settings schema, defaults, and normalization at the persistence boundary.
- `components/settings-panel.tsx` -- grouped settings UI, accessible descriptions, and immediate preference updates.
- `components/settings-storage.ts` -- local persistence and safe recovery from unavailable or malformed storage.
- `app/globals.css` -- theme, density, waveform contrast, focus, and reduced-motion tokens when existing tokens are insufficient.
- `tests/` -- unit and component coverage for defaults, persistence, accessibility semantics, and cleanup confirmation.

## Tasks & Acceptance

**Execution:**
- [x] `shared/contracts/settings.ts` -- define the versioned settings shape, documented defaults, and safe normalization -- keep UI and storage behavior aligned.
- [x] `components/settings-storage.ts` -- implement local-only load/save with malformed-storage fallback -- prevent persistence failures from blocking the workspace.
- [x] `components/settings-panel.tsx` and `components/ui/*` -- implement grouped, keyboard-accessible controls, descriptions, current values, and exact-scope cleanup confirmation -- deliver the complete settings experience.
- [x] `components/app-shell.tsx`, `app/settings/page.tsx`, and `app/globals.css` -- connect appearance, motion, density, and contrast preferences while preserving diagnostics -- make changes visible without losing work.
- [x] `tests/settings*.test.tsx` and related tests -- cover the I/O matrix and acceptance behaviors -- prevent regressions in persistence, accessibility, and destructive-action safeguards.

**Acceptance Criteria:**
- Given the Settings route is opened, when it renders, then all six settings groups are present and every setting has a visible label, explanation, current value, and accessible control.
- Given the user changes appearance, density, reduced motion, or waveform contrast, when the change is committed, then the shell updates immediately, the active draft/job remains intact, and the preference survives a reload.
- Given reduced motion or high-contrast waveform mode is enabled, when the editor/playback surfaces consume the preference, then motion is reduced and waveform distinction does not depend on color alone.
- Given output preferences are changed, when a later processing flow requests an output, then the selected defaults and destination behavior apply and an existing file cannot be overwritten without explicit confirmation.
- Given the user selects cleanup, when confirmation is opened, then the dialog names the exact scope; cancel performs no cleanup, and confirm never touches original media.
- Given local storage is unavailable or malformed, when settings loads or saves, then the workspace remains usable with safe defaults and no media leaves the device.

## Implementation Notes

- Added a versioned Zod settings contract with safe-default normalization and a dedicated browser storage boundary.
- Kept settings provider above the app shell so theme, density, motion, and waveform contrast apply across routes without remounting page work.
- Implemented cleanup as exact-scope, local key removal with an explicit confirmation dialog; original media is not represented by any cleanup key.
- Verified 22 tests, TypeScript, ESLint, and production build successfully.

## Spec Change Log

## Review Triage Log

## Design Notes

Use the Clearwave visual language already established by the shell: warm neutral surfaces, teal for primary action and status, violet reserved for comparison/focus accents, generous grouped cards, and compact status labels. Controls should use the existing shadcn primitives where possible, maintain at least a 44px interaction target, and expose descriptions through semantic `label`/description relationships rather than color-only cues. Cleanup confirmation should distinguish previews, generated outputs, history metadata, and all eligible local data so the user can make a safe choice.

## Verification

**Commands:**
- `npm test -- --run` -- expected: all existing and Story 1.3 tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- Open Settings at desktop and narrow widths; verify every group is usable by keyboard, focus is visible, labels and descriptions are announced, theme/motion/contrast changes are immediate, and cleanup confirmation names only the selected scope.
