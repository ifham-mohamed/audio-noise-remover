---
title: 'Story 4.5 — Review and Retrieve a Successful Output'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fbfe585'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-4-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
---

## Intent

Allow users to review and retrieve only a successfully validated final artifact. The original and enhanced result remain distinct, stored locally, and explicitly labeled experimental.

## Acceptance

- Given a successful job with a validated artifact ID, when the detail page loads, then it reopens and revalidates that local artifact, offers accessible playback, and displays its validated metadata and experimental status.
- Given the user downloads the result, then the exact artifact bytes are delivered under the validated output filename through the browser's download mechanism; no media bytes leave the browser.
- Given an artifact is missing or fails revalidation, then no player/download is offered, the UI gives a safe recovery message, and source bytes are never substituted as output.
- Given the job is failed, cancelled, queued, or running, then artifact retrieval controls are not rendered.

## Scope and constraints

Build on `openFinalOutput(artifactId)`, which revalidates stored WAV metadata and bytes. Playback uses a browser object URL that is revoked on cleanup. Retrieval uses browser downloads only: the intake flow retains a File, not a durable source-path handle, so a save picker cannot prove that a chosen path is not the original. Do not write into an arbitrary chosen path until source identity can be checked. Do not add output cleanup or alter source retention policy; that is tracked separately. Keep experimental status prominent and preserve the original.

## Implementation tasks

- [x] Add a client review panel that loads the exact artifact by artifact ID, revalidates it against the successful job record, exposes playback and validated metadata, and safely revokes object URLs.
- [x] Add an accessible browser download action using the exact validated filename; avoid direct filesystem writes that could overwrite the source.
- [x] Test successful reopening/playback/download bytes, inaccessible/corrupt artifacts, terminal-state gating, and local-only behavior.

## Verification

Passed: full unit suite (160 tests across 27 files), typecheck, lint, production build, FFmpeg validation, and seven real-browser E2E cases covering real output playback, byte-exact browser downloads, missing/corrupt artifact failure, retry/cancellation, and local-only requests.

## Code Map

Final artifact local store; successful job detail component; accessible browser playback/download UI; artifact and Playwright tests.

## Design Notes

The artifact ID is the only lookup key; the UI never uses `sourceRef` to populate final playback/download. Artifact validation must succeed before creating any media URL or exposing a retrieval action.

Browser download is intentionally used even when the Save File Picker API exists. Direct path saving is deferred until intake can retain a trustworthy source handle so overwrite protection can be guaranteed.

## Spec Change Log

- Initial Story 4.5 plan: review and retrieve the successful experimental WAV artifact strictly from local validated storage.
- Safety adjustment after independent review: use browser downloads rather than a path-writing picker because the app cannot compare the chosen filesystem entry with its retained original source. This preserves the no-overwrite invariant while delivering the exact validated filename and bytes.

## Review Triage Log

- `resolved / 2026-09-30` — Independent acceptance review found no unmet story acceptance criterion. The local artifact is reopened and revalidated before playback/download; absent or corrupt data fails closed, and retrieval uses the validated filename and bytes. Story review is closed. Manual browser and cross-OS checks remain separate verification follow-ups.

- `high / patch` — A save picker could overwrite the original if its path was chosen under another name or renamed after intake; retrieval now uses only the browser download flow, which never opens a writable source path.
- `medium / patch` — A save picker could allow a user-chosen name rather than the validated output filename; the browser download action uses the validated artifact name exactly.
- `medium / patch` — Missing artifact E2E did not verify corrupt-byte revalidation; browser E2E now corrupts the retained RIFF header and confirms no player or download appears, then separately checks missing-artifact handling.
- `medium / not-applicable` — Picker abort/write failures could be misreported because the selected save picker is no longer used. Direct path saving is deferred until source identity can be protected; browser download is the implemented route.
