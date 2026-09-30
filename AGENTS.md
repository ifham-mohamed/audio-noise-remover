<!-- bmad:context -->
<!-- Verified 2026-09-29 against 19dd76c1a47b5452851a11559a2ac6188cfba032. Managed by bmad-project-context; edits inside this block are replaced on refresh. -->

## ai-noice-removal

Local, speech-first audio/video denoising web application. Use the architecture spine and implementation contract as the design authority:
`_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md`
and
`_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md`.
Keep implementation work within the single-repository local product boundary.

## Policy

- Keep processing local: never upload media, decoded audio, model inputs, outputs, or media-derived telemetry.
- Preserve originals: never write an output over a source; use temporary output, validation, cleanup, and atomic rename.
- Keep job state owned by the job coordinator; do not mutate job/history state directly from UI, adapters, or unrelated server code.
- Keep browser/UI code independent of FFmpeg, ONNX Runtime, and filesystem primitives; cross boundaries through shared TypeScript/Zod contracts.
- Keep FFmpeg as the media demux/decode/encode boundary and use canonical PCM inside the audio pipeline.
- Keep AI inference behind model adapters; CPU execution must remain the safe baseline, with acceleration capability-detected.
- Do not add cloud processing, accounts, collaboration, sync, pause/resume, or desktop packaging to the speech MVP.
- Do not choose final model families, GPU matrices, output defaults, or retention policy silently; record unresolved decisions in the spec’s open questions.

## Where things are

- Product contract: `_bmad-output/specs/spec-ai-noice-removal/SPEC.md`
- Implementation contract, boundary schemas, job flow, state model, adapters, and verification: `_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md`
- Architecture decisions and dependency direction: `_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md`
- Application routes and UI composition: `app/`, `components/`, and `features/`
- Job coordinator, domain rules, ports, adapters, and worker: `server/`
- Shared runtime contracts: `shared/`
- Models and setup/diagnostic scripts: `models/` and `scripts/`
- Tests and fixtures: `tests/`
- User/developer documentation: `docs/`
- If a subtree later gains its own `AGENTS.md`, verify that every active harness loads it before relying on subtree-only rules.

## Running and verifying

- Read the relevant contract before changing architecture, job lifecycle, media handling, or model boundaries.
- For multi-step work, define a brief success criterion and verify it with focused tests before broader verification.
- Test profile validation, stage ordering, job transitions, cancellation races, retry linkage, cleanup, and atomic-output rules.
- Use integration fixtures for every supported format, video extraction, malformed media, missing models, disk failures, and output validation.
- Verify keyboard operation, visible focus, labels, screen-reader job announcements, color-independent status, and reduced-motion behavior.
- Verify Windows, macOS, and Linux capability detection and the CPU-safe path.
- Use the repository’s declared package scripts and lockfile once they exist; do not invent commands or tool versions.

## Conventions that differ from defaults

- Treat every enhancement as an explicit ordered pipeline stage with an enabled state, validated parameters, capability requirements, cancellation behavior, version, and metrics.
- Treat preview as a bounded derived artifact only; preview completion never means final-output success.
- Use typed IDs and stable error codes such as `UNSUPPORTED_MEDIA`, `MODEL_UNAVAILABLE`, `DISK_SPACE_LOW`, `CANCELLED`, and `PROCESSING_FAILED`.
- Keep retries as new linked attempts; never reuse a failed/cancelled job as the successful attempt.
- Prefer the minimum implementation that satisfies the contract; do not add speculative abstractions or features.
- Make assumptions and tradeoffs explicit; if ambiguity would change behavior, surface it before coding.
- Make surgical changes: do not refactor unrelated code or clean up pre-existing issues; remove only orphans created by your own change.
- Define success criteria for each change and loop until they are verified.

## Known pitfalls

- A cancelled or failed run must never expose a successful output; inspect cleanup and terminal state together.
- Startup must reconcile interrupted jobs so they do not remain indefinitely in `running`.
- Logs may contain request/job IDs and diagnostics, but never media bytes, raw audio, full file contents, or secrets.
- Video inputs require FFmpeg audio extraction; do not put format-specific handling in UI or model code.
- Disabled stages must be omitted rather than run with hidden defaults.
- Model-specific tensor shapes, sample rates, providers, and postprocessing stay inside model adapters.
- Do not overwrite manually selected existing outputs without an explicit warning.

<!-- /bmad:context -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
