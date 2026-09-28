---
id: SPEC-ai-noice-removal
companions:
  - implementation-contract.md
  - ../../planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md
---

> **Canonical contract.** This SPEC and the files in `companions:` define what to build, test, and validate. The architecture spine is retained as an adopted companion because it remains the governing design substrate.

# AI Noise Removal

## Why

People need a trustworthy way to make speech recordings and speech-bearing videos clearer without uploading private media or assembling a technical toolchain. This project provides a local, speech-first audio restoration workflow whose controls are understandable, whose outputs are recoverable, and whose architecture can grow into music and mixed-audio enhancement after the speech MVP proves its quality.

## Capabilities

- **CAP-1**
  - **intent:** User can select a local audio or video file and inspect supported-format metadata before starting a run.
  - **success:** MP3, WAV, M4A, FLAC, MP4, MOV, and MKV inputs are accepted when locally available; unsupported, unreadable, or unwriteable inputs receive a stable, actionable error before processing.

- **CAP-2**
  - **intent:** User can enhance speech by independently enabling and configuring noise removal, voice clarity, loudness normalization, and echo/reverb reduction.
  - **success:** A run records a normalized profile containing each stage's enabled state and parameters; the resulting pipeline executes only enabled stages in a validated order and reports the applied profile.

- **CAP-3**
  - **intent:** User can compare a bounded before/after preview produced with the selected enhancement profile.
  - **success:** The UI labels the artifact as a preview, exposes the same stage order and profile semantics as final processing, and never treats preview completion as final-output success.

- **CAP-4**
  - **intent:** User can follow an asynchronous run, cancel it, and understand whether it is queued, running, cancelling, cancelled, succeeded, or failed.
  - **success:** Progress events are associated with a typed job ID; cancellation reaches the coordinator, prevents a successful output result, cleans temporary artifacts, and leaves a terminal cancellation reason.

- **CAP-5**
  - **intent:** User can retry a failed or cancelled run without modifying the original input or conflating attempts.
  - **success:** Retry creates a new job/attempt linked to the prior job, preserves the original profile and input metadata unless changed by the user, and writes a newly validated output atomically.

- **CAP-6**
  - **intent:** User can review local history, inspect run status and diagnostics, and open successful generated outputs.
  - **success:** History survives application restart in the local store, interrupted runs are reconciled to a terminal recoverable state, and logs/history contain identifiers and diagnostics but never media bytes or raw audio.

- **CAP-7**
  - **intent:** User can operate intake, controls, preview, job actions, and history using accessible interaction patterns.
  - **success:** All controls are keyboard operable and labeled, focus is visible, status is not color-only, job transitions are announced to assistive technology, and reduced-motion preferences are respected.

- **CAP-8**
  - **intent:** System can add music and mixed-audio enhancement profiles without changing the shared job, media, storage, or model boundaries.
  - **success:** A future profile can register additional ordered stages and model adapters through the existing typed contracts while speech profiles and their fixtures remain unchanged.

## Constraints

- Processing is local-only: media, decoded audio, model inputs, temporary files, outputs, history, and logs stay on the laptop; a processing run does not require network access.
- Originals are immutable. Outputs use isolated temporary files, media validation, and atomic rename; a source path is never an output target.
- Jobs are the unit of work and the coordinator is the only writer of job state. Lifecycle states are `queued`, `running`, `cancelling`, `cancelled`, `succeeded`, and `failed`.
- FFmpeg is the only media demux/decode/encode boundary. The internal audio pipeline uses canonical PCM; model adapters own preprocessing, inference, and postprocessing.
- CPU execution is always supported. Optional acceleration and platform features are capability-detected and must degrade to a documented CPU-safe path.
- Shared TypeScript/Zod contracts and stable error envelopes govern browser/server, jobs, stages, persistence, capabilities, and diagnostics.
- The first implementation is one repository and one local web product boundary using the architecture spine's Next.js, worker, adapter, and local-store structure.

## Non-goals

- Cloud upload, remote inference, cloud sync, accounts, collaboration, or telemetry containing media.
- Pause/resume, unless a later stage can checkpoint safely.
- Packaged desktop delivery, unless browser path selection or OS integration becomes a demonstrated blocker.
- Music and mixed-audio enhancement in the speech MVP; the MVP only preserves the extension boundary.
- A final model family, GPU-provider matrix, or persistent database technology before fixture evaluation and profiling establish the need.

## Success signal

On a supported Windows, macOS, or Linux machine, a user can select a speech recording or video, independently tune the speech enhancement stages, preview the result, run the job, cancel or retry it when needed, and retrieve a validated output while the original remains unchanged and no media leaves the laptop. Automated unit, adapter-integration, and browser end-to-end tests demonstrate the same behavior across success, failure, cancellation, restart recovery, and accessibility paths.

## Assumptions

- The first release is a local browser workflow rather than a packaged desktop application.
- Exact denoising/enhancement models are selected after fixture-based quality evaluation and license review.
- A file-backed local history store is sufficient until history volume or concurrency proves otherwise.

## Open Questions

- Which model family and objective quality thresholds must pass the fixture evaluation before release?
- Which output codec/container defaults and browser playback constraints should apply per input type?
- What retention and user-controlled cleanup policy should govern history, previews, and generated outputs?
