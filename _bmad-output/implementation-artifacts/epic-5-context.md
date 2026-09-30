# Epic 5 Context: History and Extensible Enhancement Profiles

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make prior local processing runs findable, understandable, and safely manageable while keeping the application ready to add music and mixed-audio profiles later. History is a local record of job attempts and artifact availability, not a copy of media. Future support extends the existing speech-oriented contracts and does not activate unqualified music processing in the speech MVP.

## Stories

- Story 5.1: Browse and filter local processing history
- Story 5.2: Inspect history details and linked attempts
- Story 5.3: Clean up generated files and history safely
- Story 5.4: Register future music and mixed-audio profiles
- Story 5.5: Cross-platform history and cleanup behavior

## Requirements & Constraints

- Keep job/history data, diagnostics, and generated artifacts local. Persist identifiers, metadata, profiles, status, and safe diagnostics only; never persist raw media or audio in history.
- History is newest-first and supports filtering by status, media type, date, and profile. It must represent active and terminal job states, output removal, retries, and restart recovery consistently.
- The coordinator remains the authoritative writer of job state. History mutations and cleanup must use owned commands/adapters and runtime-validated shared contracts; UI code must not mutate persisted job state directly.
- Cleanup actions must state precise scope (preview, output, history metadata, all generated files), confirm destructive work, report per-item failures, preserve unrelated records/files and immutable sources, and retain safe history details when an output is removed.
- Profiles declare media support, ordered enabled stages, validated parameters, capability requirements, model adapters, and metrics through shared typed contracts. Unsupported/unavailable profiles must be explicit, without breaking existing speech profiles.
- Cross-platform UI must enable only supported local file actions and provide useful save/download or copy-path alternatives when reveal is unavailable. Keyboard access, visible focus, semantic state, and responsive layouts remain required.
- Music/mixed-audio capability is an extension boundary only. Do not claim or enable a future profile without a real supported adapter and capability; do not add cloud services, new job states, or a parallel history flow.

## Technical Decisions

- Retain the local file-backed persistence baseline; introduce a database only if measured history/query/concurrency needs justify it.
- Use the job coordinator as the only lifecycle/state authority; preserve distinct retry attempts and their links. Startup reconciliation must precede presenting persisted active jobs as current.
- Resolve artifact availability from local artifact metadata/storage, not from a source file or stale success flag. Removing an output must not erase unrelated metadata or make source bytes eligible as output.
- Keep filesystem, media, and model operations behind server/storage adapters. Cross-boundary contracts use shared TypeScript/Zod schemas and stable error envelopes; diagnostics omit media content and secrets.
- Extend existing profile/stage registration and execution boundaries rather than introducing music-specific lifecycle, retry, cancellation, or history paths.

## UX & Interaction Patterns

- History defaults to newest first; searchable/filterable controls keep active criteria visible and removable. Rows/cards show filename, media type, duration, date, profile summary, status, and only state-valid actions.
- Provide a clear empty state with “No enhancements yet” and a direct New enhancement action. Expanded details show profile, input/output metadata, runtime/model summary, job ID, diagnostics, and chronological attempt links.
- Name cleanup actions by exact target and explain what is retained. Confirmation identifies affected generated items/metadata; show success or failure without implying originals were touched.
- Show local-only trust. Use accessible buttons/labels and status text, not color alone; keep mobile history as cards and retain keyboard-operable actions.
- For unsupported reveal-in-folder behavior, explain the limitation and offer browser download/save or copy-path behavior only when that capability is actually available.

## Cross-Story Dependencies

- Story 5.1 depends on persisted job/history records and coordinator-owned list/filter reads.
- Story 5.2 builds on 5.1 and Epic 4 retry/output/recovery metadata; attempt links must not merge or overwrite attempts.
- Story 5.3 depends on the preview/output artifact stores and retention identifiers established in earlier epics; cleanup must remain separate from immutable source storage.
- Story 5.4 extends the profile/stage contracts used by editor, coordinator, execution, and history, but does not require shipping a future music model.
- Story 5.5 verifies history, artifact availability, and cleanup behavior from 5.1–5.3 across capability profiles/platforms.
