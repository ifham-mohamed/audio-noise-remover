# Build Plan — AI Noise Removal

## Delivery rule

Build in vertical slices. Each stage must leave a runnable application and a verified user outcome. Do not build all UI first and postpone the processing boundary.

## Stages

### Stage 0 — Repository and toolchain

- Scaffold Next.js App Router with TypeScript, Tailwind, shadcn/ui, and npm.
- Add shared linting, formatting, type-checking, test scripts, and environment validation.
- Add the local privacy statement and a health/capability endpoint.

**Exit gate:** the browser opens locally, the project type-checks, and the health screen reports Node, FFmpeg, model directory, writable storage, and CPU capability.

### Stage 1 — Media intake and safe output

- Accept the supported audio/video formats.
- Inspect metadata through FFmpeg.
- Extract audio from video without changing the original.
- Implement output profile and atomic output writing.

**Exit gate:** every supported input type can be inspected and copied/transcoded to a validated output fixture.

### Stage 2 — Job system and progress

- Implement job state machine, event stream, cancellation, retry, startup reconciliation, and local history.
- Add bounded concurrency and disk-space checks.

**Exit gate:** a long-running test job reports progress, can be cancelled safely, and a failed job can be retried without touching the source.

### Stage 3 — Speech denoising MVP

- Add one CPU-safe ONNX speech-denoising model adapter.
- Add model preprocessing/postprocessing and quality metrics.
- Add noise-removal intensity control and safe defaults.

**Exit gate:** a fixture set demonstrates meaningful noise reduction without unacceptable speech artifacts, and the final artifact validates.

### Stage 4 — Enhancement controls and preview

- Add clarity, loudness normalization, echo/reverb reduction, and enhancement stages independently.
- Add before/after preview, waveform/timeline, effect controls, and profile persistence.

**Exit gate:** each effect can be toggled and adjusted independently; preview and final output use the same profile.

### Stage 5 — UX hardening and cross-platform setup

- Add accessible empty/loading/error/success states.
- Add first-run setup, model management, diagnostics, cleanup, and platform-aware path selection.
- Verify Windows, macOS, and Linux setup scripts.

**Exit gate:** a new user can install, process a file, find the result, and clear history using the documented commands.

### Stage 6 — Quality, release, and future audio profiles

- Add regression fixtures, performance baselines, security review, and packaging/release artifacts.
- Evaluate music and mixed-audio profiles against separate quality criteria.

**Exit gate:** release checklist passes and future profiles can be added without changing the job/API contract.

## Definition of done for every stage

- Feature has typed contracts and tests.
- Original file is preserved.
- Errors are actionable and local-only.
- UI has keyboard and screen-reader states.
- Documentation is updated with exact commands.
- `npm run lint`, `npm run typecheck`, and relevant tests pass.
