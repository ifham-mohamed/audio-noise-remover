# Epic 4 Context: Process, Recover, and Retrieve Outputs

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable users to run asynchronous final enhancement, understand progress and outcomes, safely cancel or retry work, recover interrupted jobs, and retrieve only validated outputs. Throughout the lifecycle, the source remains unchanged and failed or cancelled work is never presented as a successful artifact.

## Stories

- Story 4.1: Start and Monitor Final Processing
- Story 4.2: Produce and Validate an Immutable Output
- Story 4.3: Cancel an Active Processing Job Safely
- Story 4.4: Retry and Recover Interrupted Jobs
- Story 4.5: Review and Retrieve a Successful Output

## Requirements & Constraints

- Create final work as an asynchronous job so the browser request remains responsive. Report authoritative lifecycle state, active stage, elapsed time, and progress when available; omit disabled pipeline stages.
- A successful result requires final media validation. On validation, encoding, or storage failure, fail the job, clean temporary artifacts, preserve the original, and expose no success/output action.
- Cancellation is cooperative: move through `cancelling`, stop at a safe point, clean temporary output, and finish `cancelled` without a successful artifact. Resolve races with validation through one authoritative coordinator terminal result.
- Retrying a failed or cancelled run creates a new linked attempt and ID. Keep prior attempts and their diagnostics intact; record the selected profile snapshot and any changed settings.
- On startup, reconcile persisted `running` or `cancelling` jobs to recoverable `failed` or `cancelled` states with an explicit restart reason. Do not leave jobs indefinitely active.
- Keep media, decoded audio, models, temporary files, outputs, history, and logs on-device. Logs and diagnostics may include IDs and safe context, never media bytes, raw audio, complete file contents, or secrets.
- Provide calm, specific status and error language that explains what happened, what remains safe, and the available next action. Keep essential state and actions in the page, not only in transient toasts; announce job transitions accessibly and never rely on color alone.

## Technical Decisions

- Use the layered local pipeline: browser UI → typed server boundary → job coordinator → media/audio/model/storage adapters. Shared TypeScript/Zod contracts and runtime validation govern boundary payloads, events, persistence, and results. UI code does not access FFmpeg, ONNX Runtime, or filesystem primitives.
- The coordinator is the sole writer of job state and resolves cancellation/terminal races. Jobs carry typed IDs, immutable input metadata, a normalized profile, progress events, and a terminal result. Use states `queued`, `running`, `cancelling`, `cancelled`, `succeeded`, and `failed`.
- FFmpeg owns media demux, decode, and encode; use canonical PCM within the audio pipeline. Execute only the validated ordered enabled stages. AI inference remains behind adapters; CPU is the safe baseline and acceleration is capability-detected.
- Write each output to an isolated temporary artifact, never to the source path. Validate the completed media before atomic rename to the destination; clean temporary files at startup and terminal completion. Check storage capability/space and require an explicit decision when an existing destination would be overwritten.
- API responses use `{ data, error, requestId }`; errors use stable codes and user-safe messages with non-sensitive diagnostics. Keep processing local and support Windows, macOS, and Linux through capability detection.

## UX & Interaction Patterns

- Keep active-job status available in the shell so users can leave and return to the same run. On narrow screens, show it as a top-level banner.
- Show queued, stage-specific running, cancelling, cancelled, succeeded, failed, and restart-recovered states. Include a clear stage label, progress when determinate, elapsed time, and valid actions for that state. During cancellation say “Cancelling… finishing the current step.”
- On success, show the output filename/path or supported save action, media metadata, applied stages/profile, model/runtime summary, and validation status. Offer accessible output playback, copy path, and folder reveal only where supported; fall back to supported save/copy actions.
- On failure, identify the safe error category and next steps such as retry, change settings, or diagnostics. On cancellation, confirm no successful output was created. Clearly mark the original unchanged; never imply upload or remote processing.
- Preserve keyboard operation, visible focus, screen-reader announcements, reduced-motion behavior, semantic status, and non-color state cues across processing and result views.

## Cross-Story Dependencies

- Epic 2 supplies validated media, normalized processing/output profiles, destination and overwrite decisions, and capability readiness required before processing.
- Epic 3 preview is a bounded derived artifact only; it does not satisfy final output success or replace the final validation flow.
- Epic 5 history consumes coordinator-owned job state, terminal diagnostics, output availability, and linked retry attempts; its retry action uses the new-attempt behavior defined here.
