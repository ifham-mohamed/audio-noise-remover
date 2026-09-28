---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/specs/spec-ai-noice-removal/SPEC.md
  - _bmad-output/specs/spec-ai-noice-removal/implementation-contract.md
  - _bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-ai-noice-removal-2026-09-29/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-ai-noice-removal-2026-09-29/EXPERIENCE.md
---

# ai-noice-removal - Delivery Plan

## Overview

This document provides the epic and story breakdown for ai-noice-removal, decomposing the product specification, UX contract, implementation contract, and architecture spine into implementable work.

## Requirements Inventory

### Functional Requirements

- FR1: User can select a local MP3, WAV, M4A, FLAC, MP4, MOV, or MKV file.
- FR2: System validates the selected file and presents media type, duration, size, audio stream, and readiness or an actionable error before processing.
- FR3: User can configure noise removal independently.
- FR4: User can configure voice clarity independently.
- FR5: User can configure loudness normalization independently.
- FR6: User can configure echo/reverb reduction independently.
- FR7: System records a normalized processing profile with enabled stages, parameters, order, model versions, and output profile.
- FR8: User can generate a bounded before/after preview from the current profile.
- FR9: User can play, pause, seek, mute, and compare before/after preview audio with a synchronized waveform/timeline.
- FR10: User can start an asynchronous final processing job and observe its lifecycle and progress.
- FR11: User can cancel a queued or running job and receive a terminal cancellation result without a successful output.
- FR12: User can retry a failed or cancelled run as a new linked attempt.
- FR13: User can review successful outputs, applied profiles, diagnostics, and generated-file actions.
- FR14: User can browse local history and filter/search runs by status, media type, date, and profile.
- FR15: User can configure output format, quality, destination, overwrite behavior, playback, appearance, accessibility, and cleanup settings.
- FR16: System reconciles interrupted jobs after restart and exposes a recoverable terminal state.
- FR17: System exposes local capability and readiness information for FFmpeg, models, CPU/accelerators, permissions, disk space, and browser support.
- FR18: System can add future music and mixed-audio stages through the existing profile, job, media, storage, and model boundaries.

### NonFunctional Requirements

- NFR1: Processing is local-only; media, decoded audio, model inputs, temporary files, outputs, history, and logs remain on the laptop.
- NFR2: Originals are immutable; outputs use isolated temporary files, validation, cleanup, and atomic rename.
- NFR3: Jobs use typed lifecycle states: queued, running, cancelling, cancelled, succeeded, and failed.
- NFR4: The job coordinator is the only writer of job state; history changes flow through coordinator commands.
- NFR5: FFmpeg is the only media demux/decode/encode boundary; internal processing uses canonical PCM.
- NFR6: AI inference is behind model adapters; CPU execution is always supported and acceleration is capability-detected.
- NFR7: Shared TypeScript/Zod contracts and runtime validation govern all browser/server, job, stage, persistence, capability, and error boundaries.
- NFR8: API responses use `{ data, error, requestId }`; errors use stable codes and non-sensitive diagnostics.
- NFR9: Structured logs may contain request/job IDs and timings but never media bytes, raw audio, complete file contents, or secrets.
- NFR10: UI meets WCAG 2.2 AA behavior requirements: keyboard operation, visible focus, labels, semantic status, screen-reader job announcements, reduced motion, and non-color state communication.
- NFR11: Cross-platform behavior supports Windows, macOS, and Linux through capability detection with a documented CPU-safe fallback.
- NFR12: Final output success requires media validation; failed/cancelled runs must not expose a successful output artifact.
- NFR13: Preview is clearly labeled, bounded, and never substitutes for final output success.
- NFR14: The repository uses the architecture baseline of Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, FFmpeg, ONNX Runtime, Zod, Pino, and npm, with exact versions verified in implementation.

### Additional Requirements

- Use one repository and one local product boundary with `app/`, `components/`, `features/`, `server/`, `shared/`, `models/`, `scripts/`, `tests/`, and `docs/` ownership boundaries.
- Implement layered ports-and-adapters boundaries: UI → typed server boundary → job coordinator → media/audio/model/storage adapters.
- Keep UI code from importing FFmpeg, ONNX Runtime, or filesystem primitives; adapters must not import UI code.
- Give every job typed branded IDs, immutable input metadata, normalized profile, progress events, and a terminal result.
- Make pipeline stages declare formats, parameters, capability requirements, cancellation support, version, and metrics; disabled stages are omitted.
- Use stable error codes including `UNSUPPORTED_MEDIA`, `MODEL_UNAVAILABLE`, `DISK_SPACE_LOW`, `CANCELLED`, and `PROCESSING_FAILED`.
- Clean temporary files at startup and terminal completion; reconcile interrupted jobs with a recoverable reason.
- Display local-processing trust, runtime/model versions and licenses, storage health, overwrite warnings, and cleanup controls.
- Start with a local file-backed history store; defer SQLite unless history/query/concurrency needs prove it necessary.
- Defer pause/resume, cloud features, accounts, collaboration, remote processing, and desktop packaging.

### UX Design Requirements

- UX-DR1: Implement the Clearwave Studio visual token layer over shadcn/ui: deep studio/dark and paired light surfaces, teal primary action, violet comparison accent, semantic status colors, Geist typography, 4px spacing rhythm, and defined radii.
- UX-DR2: Implement a responsive shell with New enhancement, History, Settings, active-job status, and persistent “On this device” trust indicator.
- UX-DR3: Implement intake with keyboard-accessible drop zone and Browse action, supported-format guidance, local metadata card, replace/remove actions, video audio-stream summary, and actionable inspection errors.
- UX-DR4: Implement the editor as a desktop two-column workspace and responsive stacked mobile layout with media preview, waveform/timeline, transport controls, effect inspector, output settings, and sticky mobile primary action.
- UX-DR5: Implement independent effect cards for noise removal, voice clarity, loudness normalization, and echo/reverb reduction with switches, parameters, explanations, reset actions, capability state, advanced disclosure, and visible pipeline summary.
- UX-DR6: Implement semantic waveform/timeline behavior with time ruler, playhead, preview bounds, text time readout, play/pause, seek, mute, A/B controls, and a non-canvas text alternative.
- UX-DR7: Implement bounded preview states: preparing, stage progress, ready, cancelled, failed, and retry, with clear `Preview` labeling and before/after/A-B comparison.
- UX-DR8: Implement processing states and progress card for queued, stage-specific running, cancelling, cancelled, succeeded, failed, and restart-recovered states, including cancel, retry, diagnostics, and output actions.
- UX-DR9: Implement local history with newest-first rows/cards, search/filter controls, expandable profile/diagnostic details, output actions, retry linkage, and precise cleanup scopes.
- UX-DR10: Implement settings and diagnostics groups for appearance, playback, output, local processing readiness, privacy/cleanup, and accessibility.
- UX-DR11: Implement WCAG 2.2 AA interaction behavior: semantic landmarks, focus restoration, live job announcements, visible focus, reduced motion, non-color status, 44px touch targets, zoom-safe layouts, and error summaries.
- UX-DR12: Use calm, direct microcopy that explains what happened, what remains safe, and what action is available; never imply cloud upload or magic enhancement.
- UX-DR13: Support responsive breakpoints for full desktop editor, compact/tablet inspector drawer, and mobile sheet navigation/single-column editor.
- UX-DR14: Preserve extension behavior for future music/mixed-audio profiles without special-case job, history, cancellation, or output flows.

### FR Coverage Map

FR1: Epic 2 - Import supported local audio/video media.
FR2: Epic 2 - Inspect metadata and show readiness or actionable validation errors.
FR3: Epic 2 - Configure noise removal independently.
FR4: Epic 2 - Configure voice clarity independently.
FR5: Epic 2 - Configure loudness normalization independently.
FR6: Epic 2 - Configure echo/reverb reduction independently.
FR7: Epic 2 - Record normalized ordered processing profiles.
FR8: Epic 3 - Generate bounded before/after previews.
FR9: Epic 3 - Play, seek, and compare preview audio with waveform/timeline controls.
FR10: Epic 4 - Start asynchronous processing and observe lifecycle/progress.
FR11: Epic 4 - Cancel queued/running jobs safely.
FR12: Epic 4 - Retry failed/cancelled runs as linked attempts.
FR13: Epic 4 - Review and retrieve validated outputs and diagnostics.
FR14: Epic 5 - Browse, search, filter, and manage local history.
FR15: Epic 1 and Epic 2 - Configure application and output settings.
FR16: Epic 4 - Reconcile interrupted jobs after restart.
FR17: Epic 1 - Expose local runtime and capability readiness.
FR18: Epic 5 - Extend the profile and adapter boundaries for future music/mixed-audio stages.

## Delivery Epics

### Epic 1: Trustworthy Local Workspace

Users can open the application, understand that processing is local, verify runtime readiness, choose appearance/accessibility preferences, and navigate the complete workflow.
**FRs covered:** FR15, FR17
**UX foundation:** UX-DR1, UX-DR2, UX-DR10, UX-DR11, UX-DR12, UX-DR13

### Epic 2: Add Media and Tune Speech Enhancement

Users can import supported audio/video, inspect media metadata, configure each speech effect independently, and define output settings.
**FRs covered:** FR1-FR7, FR15
**UX foundation:** UX-DR3, UX-DR4, UX-DR5, UX-DR6

### Epic 3: Preview and Compare Improvements

Users can generate a bounded preview, inspect progress, and compare before/after audio using waveform, timeline, transport, and A/B controls.
**FRs covered:** FR8-FR9
**UX foundation:** UX-DR6, UX-DR7

### Epic 4: Process, Recover, and Retrieve Outputs

Users can run final processing, monitor stages, cancel safely, retry failed/cancelled attempts, recover from interrupted jobs, and retrieve validated outputs.
**FRs covered:** FR10-FR13, FR16
**UX foundation:** UX-DR8, UX-DR12

### Epic 5: History and Extensible Enhancement Profiles

Users can search and manage local processing history, inspect diagnostics, clean generated artifacts safely, and use future music/mixed-audio profiles without changing the core workflow.
**FRs covered:** FR14, FR18
**UX foundation:** UX-DR9, UX-DR10, UX-DR14

## Epic 1: Trustworthy Local Workspace

Users can open the application, understand that processing is local, verify runtime readiness, choose appearance/accessibility preferences, and navigate the complete workflow.

### Story 1.1: Local Application Shell and Navigation

As a local media editor,
I want a clear application shell with New enhancement, History, Settings, and active-job navigation,
So that I always know where I am and what the application can do.

**Requirements:** FR15, FR17, UX-DR2, UX-DR12

**Acceptance Criteria:**

**Given** the application starts
**When** the shell renders
**Then** it shows the Clearwave Studio identity, current surface title, New enhancement action, History navigation, Settings navigation, and an “On this device” trust indicator
**And** no account, upload, cloud-sync, or remote-processing language is shown.

**Given** the user selects a navigation item
**When** the destination loads
**Then** the active item is visibly identified and the main heading describes the destination
**And** keyboard focus moves to the destination heading or first meaningful control.

**Given** an active preview or processing job exists
**When** the user navigates away from the editor
**Then** a compact active-job status remains available in the shell
**And** selecting it returns the user to the active job.

### Story 1.2: Local Runtime Readiness and Diagnostics

As a user,
I want to know whether local processing is ready before I begin,
So that I do not configure a job that cannot run.

**Requirements:** FR17, NFR6, NFR11, UX-DR10

**Acceptance Criteria:**

**Given** the application starts
**When** capability detection completes
**Then** the app reports FFmpeg readiness, model availability/version, CPU or accelerator provider, writable storage, available disk space, operating system, and browser capabilities
**And** the CPU-safe path is identified when acceleration is unavailable.

**Given** a required capability is unavailable
**When** the user opens the local trust badge or Settings
**Then** the app shows “Local setup needs attention,” identifies the unavailable capability, and provides an actionable diagnostic message
**And** media selection and draft editing remain available unless processing is unsafe.

**Given** the user opens diagnostics
**When** they choose to copy diagnostic details
**Then** the copied report excludes media bytes, raw audio, full file contents, and secrets.

### Story 1.3: Appearance, Playback, Output, and Accessibility Settings

As a user,
I want to configure appearance, playback, output, cleanup, and accessibility preferences,
So that the local editor matches my needs and workflow.

**Requirements:** FR15, NFR10, UX-DR1, UX-DR10, UX-DR11

**Acceptance Criteria:**

**Given** the user opens Settings
**When** the settings surface renders
**Then** it groups Appearance, Playback, Output, Local processing, Privacy and cleanup, and Accessibility settings
**And** each setting has a visible label, explanation, current value, and accessible control.

**Given** the user changes appearance
**When** they select system, dark, or light mode
**Then** the shell updates without losing the active draft or job state.

**Given** the user enables reduced motion or high-contrast waveform mode
**When** they return to the editor
**Then** progress and transitions respect reduced motion and waveform state remains distinguishable without relying on color.

**Given** the user configures output destination or overwrite behavior
**When** an existing destination is selected
**Then** the app preserves the preference and requires an explicit overwrite decision before final processing.

### Story 1.4: Responsive and Accessible Shell Behavior

As a keyboard, screen-reader, or touch user,
I want the shell and settings surfaces to remain operable across viewport sizes,
So that the application does not require a specific device or input method.

**Requirements:** NFR10, NFR11, UX-DR11, UX-DR13

**Acceptance Criteria:**

**Given** the viewport is at least 1024px wide
**When** the shell renders
**Then** it uses the desktop navigation rail and workspace layout.

**Given** the viewport is below 1024px
**When** the shell renders
**Then** navigation collapses to a shadcn Sheet or compact rail appropriate to the breakpoint
**And** the current surface remains reachable without hover-only controls.

**Given** the user navigates with a keyboard
**When** they tab through the shell
**Then** focus order follows visual reading order, focus indicators are visible, and Escape closes the topmost sheet/popover/dialog and restores focus to its trigger.

**Given** a screen reader is active
**When** the user changes surfaces or settings
**Then** the new heading and relevant state are announced through semantic landmarks and live-region behavior.

<!-- Repeat for each epic in epics_list (N = 2, 3...) -->

## Epic 2: Add Media and Tune Speech Enhancement

Users can import supported audio/video, inspect media metadata, configure each speech effect independently, and define output settings.

### Story 2.1: Select and Inspect Local Media

As a user,
I want to select an audio or video file from my device,
So that I can confirm it is usable before configuring enhancement.

**Requirements:** FR1, FR2, NFR1, NFR5, UX-DR3

**Acceptance Criteria:**

**Given** the user opens New enhancement
**When** the intake surface renders
**Then** it shows a keyboard-accessible drop zone, Browse action, supported-format list, and local-processing explanation
**And** supported formats include MP3, WAV, M4A, FLAC, MP4, MOV, and MKV.

**Given** the user drops a file or chooses Browse
**When** inspection begins
**Then** the UI shows `Inspecting file…` and prevents processing until validation completes
**And** the source remains local.

**Given** a supported file is readable
**When** inspection completes
**Then** the UI shows filename, media type, duration, file size, audio stream details, and `Ready to enhance`.

**Given** the file is unsupported, corrupt, unreadable, or has no usable audio stream
**When** inspection completes
**Then** the UI shows a stable actionable error and a replace/remove action
**And** no processing job is created.

### Story 2.2: Review Media Card and Video Audio Stream

As a user,
I want to understand how the selected media will be processed,
So that video and audio inputs behave predictably.

**Requirements:** FR1, FR2, FR7, NFR5, NFR7, UX-DR3, UX-DR4

**Acceptance Criteria:**

**Given** a video contains a readable audio stream
**When** metadata inspection completes
**Then** the media card identifies the video, selected/default audio stream, channel layout, sample rate, duration, and output implications
**And** the editing experience remains audio-first.

**Given** a video contains multiple audio streams
**When** stream metadata is available
**Then** the user can select the intended stream or receives a documented default selection
**And** the selected stream is stored in the processing profile.

**Given** the user chooses Replace or Remove
**When** the action completes
**Then** the current media card and draft profile are cleared or replaced without modifying the source file.

### Story 2.3: Configure Independent Speech Effects

As a user,
I want separate controls for each speech enhancement effect,
So that I can control the result instead of applying an opaque preset.

**Requirements:** FR3, FR4, FR5, FR6, FR7, NFR6, NFR7, UX-DR5

**Acceptance Criteria:**

**Given** valid media is loaded
**When** the editor renders
**Then** it shows separate effect cards for noise removal, voice clarity, loudness normalization, and echo/reverb reduction
**And** each card includes an enabled switch, plain-language explanation, parameter control where applicable, reset action, and capability state.

**Given** the user disables an effect
**When** the profile is normalized
**Then** that stage is omitted from the ordered pipeline rather than run with a hidden default.

**Given** the user changes an effect parameter
**When** the value changes
**Then** the control exposes its current value and unit accessibly
**And** the pipeline summary updates to show what will run.

**Given** a model or capability required by an effect is unavailable
**When** the effect card renders
**Then** the card explains the limitation and prevents unsafe activation
**And** CPU-safe alternatives remain available when supported.

### Story 2.4: Use Waveform, Timeline, and Transport Controls

As a user,
I want to inspect and play the source waveform,
So that I can choose meaningful preview ranges and hear what needs improvement.

**Requirements:** FR9, NFR10, UX-DR6, UX-DR11

**Acceptance Criteria:**

**Given** valid media is loaded
**When** the editor renders
**Then** it shows a semantic waveform, time ruler, playhead, current-time readout, and media duration
**And** the waveform is not the only way to access timeline information.

**Given** the user operates transport controls
**When** they choose play/pause, seek, mute, or a keyboard seek shortcut
**Then** playback and the playhead update consistently
**And** Space does not control playback while focus is inside a text input.

**Given** the user has enabled reduced motion
**When** the playhead or waveform updates
**Then** motion is reduced without removing current-time feedback.

**Given** the browser cannot provide the full waveform interaction
**When** the editor initializes
**Then** text time controls and accessible transport buttons remain usable.

### Story 2.5: Define and Validate Output Profile

As a user,
I want to choose output format, quality, destination, and overwrite behavior,
So that the generated artifact fits my workflow.

**Requirements:** FR7, FR15, NFR2, NFR7, UX-DR4

**Acceptance Criteria:**

**Given** valid media and a draft enhancement profile exist
**When** the output section renders
**Then** it shows explicit format/container, quality or bitrate where applicable, destination, and overwrite settings
**And** defaults are visible and reviewable: 48 kHz WAV PCM 24-bit for audio, source-container video with AAC 192 kbps when supported, and MP4/H.264/AAC fallback when required.

**Given** the selected destination already contains a file
**When** the user prepares to process
**Then** the UI shows the exact target and an explicit overwrite warning
**And** processing cannot start until the user chooses overwrite or another destination.

**Given** the browser supports the File System Access API
**When** the user chooses a destination
**Then** the app uses the supported picker and folder-reveal behavior.

**Given** the browser does not support the File System Access API
**When** the user chooses a destination
**Then** the app uses the browser save/download flow and offers Copy output path instead of requiring arbitrary local path access.

**Given** the user changes output settings
**When** the profile is normalized
**Then** the output profile is included in the typed processing profile
**And** the source path is never eligible as an output target.

**Given** the profile is invalid or required capabilities are unavailable
**When** the user attempts to continue
**Then** the UI identifies the blocking field or capability and keeps the draft available for correction.

<!-- Repeat for each epic in epics_list (N = 3, 4...) -->

## Epic 3: Preview and Compare Improvements

Users can generate a bounded preview, inspect progress, and compare before/after audio using waveform, timeline, transport, and A/B controls.

### Story 3.1: Create a Bounded Preview

As a user,
I want to generate a short preview from my current enhancement profile,
So that I can evaluate the effect before creating a final output.

**Requirements:** FR8, NFR7, NFR13, UX-DR7

**Acceptance Criteria:**

**Given** valid media and a valid normalized profile exist
**When** the user selects Preview
**Then** the system creates a typed preview job using a bounded media segment
**And** the preview records the same stage order, enabled settings, model versions, and output semantics as the final profile.

**Given** preview processing begins
**When** the preview surface opens
**Then** it is clearly labeled `Preview` and shows the selected time range and active profile
**And** it does not present the preview as a final output.

**Given** the user changes effect settings after a preview is created
**When** they request another preview
**Then** a new preview uses the updated normalized profile
**And** the prior preview cannot be mistaken for the current profile.

### Story 3.2: Show Preview Progress, Cancellation, and Failure

As a user,
I want clear feedback while a preview is being generated,
So that I know whether to wait, cancel, or retry.

**Requirements:** FR8, NFR3, NFR7, NFR13, UX-DR7, UX-DR11

**Acceptance Criteria:**

**Given** a preview job is queued or running
**When** progress events arrive
**Then** the UI shows the current phase, determinate progress when available, elapsed time, and a cancel action
**And** progress is associated with the correct typed job ID.

**Given** the user cancels preview
**When** cancellation is requested
**Then** the UI changes to `Cancelling… finishing the current step`
**And** the terminal state is `Cancelled` with no successful preview artifact exposed.

**Given** preview processing fails
**When** the job reaches a failed terminal state
**Then** the UI explains the failed stage or stable error category
**And** offers Retry preview, Change settings, and Open diagnostics where applicable.

**Given** preview processing succeeds
**When** the artifact is ready
**Then** the UI announces `Preview ready` and exposes the comparison controls.

### Story 3.3: Compare Before and After Preview Audio

As a user,
I want synchronized before/after playback with accessible controls,
So that I can judge whether the enhancement improves the recording.

**Requirements:** FR9, NFR10, NFR13, UX-DR6, UX-DR7, UX-DR11

**Acceptance Criteria:**

**Given** a preview artifact is ready
**When** the comparison workspace renders
**Then** it shows Before, After, and A/B choices, synchronized timeline position, preview bounds, time readout, and waveform state
**And** the active side is conveyed with text and not color alone.

**Given** the user selects A/B
**When** playback is started or sought
**Then** the before and after tracks remain synchronized at the same time position
**And** the comparison state is announced to assistive technology.

**Given** the user operates the comparison with keyboard or screen reader
**When** they use labeled buttons or shortcuts
**Then** they can play/pause, seek, mute, switch Before/After/A-B, and return to controls without requiring canvas interaction.

**Given** reduced motion is enabled
**When** the playhead or comparison divider updates
**Then** the UI uses static or reduced transitions while retaining accurate time and active-side feedback.

<!-- Repeat for each epic in epics_list (N = 4, 5...) -->

## Epic 4: Process, Recover, and Retrieve Outputs

Users can run final processing, monitor stages, cancel safely, retry failed/cancelled attempts, recover from interrupted jobs, and retrieve validated outputs.

### Story 4.1: Start and Monitor Final Processing

As a user,
I want to start final enhancement and see what the system is doing,
So that I can trust the run and know when the output is ready.

**Requirements:** FR10, NFR3, NFR4, NFR7, UX-DR8

**Acceptance Criteria:**

**Given** valid media, profile, capabilities, and output settings exist
**When** the user selects Process
**Then** the system creates a typed job with immutable input metadata, normalized profile, job ID, and request ID
**And** the job enters `queued` or `running` without blocking the browser request.

**Given** the job is queued or running
**When** progress events arrive
**Then** the UI shows the current lifecycle state, current stage, elapsed time, and determinate progress when available
**And** stages are named clearly, including media preparation, enabled enhancement stages, encoding, and validation.

**Given** the profile contains disabled stages
**When** processing runs
**Then** disabled stages are omitted from execution and from active-stage progress.

**Given** a job is active
**When** the user navigates to another surface
**Then** the active-job status remains visible and returns to the same job when selected.

### Story 4.2: Produce and Validate an Immutable Output

As a user,
I want the final output written safely and validated before it is offered to me,
So that my original media cannot be damaged and corrupt output is not presented as successful.

**Requirements:** FR13, NFR2, NFR5, NFR9, NFR12

**Acceptance Criteria:**

**Given** the worker has processed the canonical PCM through the enabled pipeline
**When** encoding begins
**Then** FFmpeg is the only media encode boundary and the selected output profile is applied.

**Given** an output is being written
**When** the temporary artifact is created
**Then** it is isolated from the source and final destination
**And** the original source path cannot be used as an output target.

**Given** encoding completes
**When** final media validation passes
**Then** the artifact is atomically renamed to the destination
**And** the job can transition to `succeeded`.

**Given** the speech quality fixture gate runs
**When** the candidate CPU-safe model is evaluated
**Then** the release candidate meets median STOI improvement of at least 0.03, median SI-SDR improvement of at least 3 dB, no more than 0.10 PESQ regression on clean-speech fixtures, zero introduced clipping, and loudness within 1 LU of the configured target.

**Given** validation, encoding, or storage fails
**When** the worker reaches a terminal state
**Then** the job is `failed`, temporary artifacts are cleaned, the original remains unchanged, and no successful output action is shown.

### Story 4.3: Cancel an Active Processing Job Safely

As a user,
I want to cancel processing when I no longer need to wait,
So that the application stops work without pretending an incomplete file is valid.

**Requirements:** FR11, NFR3, NFR4, NFR12, UX-DR8

**Acceptance Criteria:**

**Given** a job is queued or running
**When** the user selects Cancel
**Then** the job transitions to `cancelling` and the UI shows `Cancelling… finishing the current step`.

**Given** cancellation is requested
**When** the worker reaches a safe stopping point
**Then** the job transitions to `cancelled`, temporary artifacts are removed, and no successful output artifact is exposed.

**Given** cancellation races with successful validation
**When** the coordinator resolves the race
**Then** only one terminal result is recorded and the UI reflects the coordinator’s authoritative result.

**Given** the job is already terminal
**When** the user views it
**Then** Cancel is unavailable and the terminal reason remains visible in history/details.

### Story 4.4: Retry and Recover Interrupted Jobs

As a user,
I want to retry failed or cancelled processing and recover runs interrupted by an app restart,
So that I can continue without losing the original or confusing attempts.

**Requirements:** FR12, FR16, NFR3, NFR4, UX-DR8

**Acceptance Criteria:**

**Given** a job is `failed` or `cancelled`
**When** the user selects Retry
**Then** a new job/attempt is created with a new job ID linked to the prior job
**And** the source and prior attempt remain unchanged.

**Given** an app restart finds a job persisted as `running` or `cancelling`
**When** startup reconciliation completes
**Then** the job is moved to a recoverable `failed` or `cancelled` state with an explicit restart reason
**And** it cannot remain indefinitely active.

**Given** a retry is created
**When** the new job begins
**Then** it uses the selected profile snapshot and records any changed settings explicitly
**And** the UI identifies the attempt relationship.

### Story 4.5: Review and Retrieve a Successful Output

As a user,
I want to inspect and retrieve a successful enhanced file,
So that I can use the result while understanding what was applied.

**Requirements:** FR13, NFR12, UX-DR8, UX-DR12

**Acceptance Criteria:**

**Given** a job succeeds
**When** the result surface renders
**Then** it shows output filename/path or supported save action, media metadata, applied stage profile, model/runtime summary, and output validation status.

**Given** the user selects Preview output
**When** playback is available
**Then** the generated artifact opens in the same accessible transport pattern used by preview.

**Given** the user selects Copy output path or Show in folder
**When** the platform supports the action
**Then** the action completes without exposing media content to a remote service
**And** unsupported actions degrade to a supported save or copy-path action.

**Given** the original and generated output are both visible
**When** the user reviews the result
**Then** the original is clearly marked unchanged and no action can overwrite it silently.

<!-- Repeat for each epic in epics_list (N = 5...) -->

## Epic 5: History and Extensible Enhancement Profiles

Users can search and manage local processing history, inspect diagnostics, clean generated artifacts safely, and use future music/mixed-audio profiles without changing the core workflow.

### Story 5.1: Browse and Filter Local Processing History

As a user,
I want to browse and filter my local enhancement history,
So that I can quickly find prior runs and outputs.

**Requirements:** FR14, NFR4, UX-DR9

**Acceptance Criteria:**

**Given** the user opens History
**When** history loads
**Then** it shows newest-first rows or cards with filename, media type, duration, date, profile summary, and status
**And** history data is loaded from the local store.

**Given** the user applies status, media type, date, or profile filters
**When** the filter changes
**Then** only matching local runs are shown
**And** the active filters are visible and removable.

**Given** no history exists
**When** the History surface renders
**Then** it shows `No enhancements yet` and a direct New enhancement action.

**Given** history contains an active job
**When** the row renders
**Then** it shows the current lifecycle state and a View run action
**And** it does not offer actions that are invalid for that state.

### Story 5.2: Inspect History Details and Linked Attempts

As a user,
I want to inspect the profile, diagnostics, and retry relationships for a run,
So that I can understand what happened and repeat work safely.

**Requirements:** FR13, FR14, NFR8, NFR9, UX-DR9

**Acceptance Criteria:**

**Given** the user expands a history row
**When** details render
**Then** the UI shows the applied stages and parameters, input metadata, output metadata when available, model/runtime summary, job ID, and terminal reason.

**Given** a run has linked retries
**When** the user views its details
**Then** the prior and subsequent attempts are identifiable in chronological order
**And** each attempt retains its own terminal state and diagnostics.

**Given** a failed or cancelled run is selected
**When** the user chooses Retry
**Then** the application creates a new linked attempt using the Epic 4 retry behavior
**And** the history list updates without deleting the prior attempt.

**Given** diagnostic details are expanded
**When** the user copies them
**Then** request/job IDs and safe diagnostic context are included
**And** media bytes, raw audio, complete file contents, and secrets are excluded.

### Story 5.3: Clean Up Generated Files and History Safely

As a user,
I want precise cleanup controls for generated artifacts and history metadata,
So that I can manage local storage without deleting my originals.

**Requirements:** FR14, FR15, NFR1, NFR2, NFR9, UX-DR9, UX-DR10

**Acceptance Criteria:**

**Given** the user opens cleanup controls
**When** available scopes are shown
**Then** the UI distinguishes Remove preview, Remove output, Clear history metadata, and Remove all generated files
**And** each scope explains exactly what it affects.

**Given** the user confirms cleanup
**When** cleanup completes
**Then** selected generated files or metadata are removed locally
**And** immutable source files are never included.

**Given** a generated output is referenced by history
**When** the output is removed
**Then** history remains with a clear `Output removed` state and retains safe metadata/diagnostics according to the configured policy.

**Given** cleanup encounters a permission or disk error
**When** the operation fails
**Then** the UI identifies the affected item and leaves unrelated files and history intact.

### Story 5.4: Register Future Music and Mixed-Audio Profiles

As a product developer,
I want future music and mixed-audio stages to register through the existing pipeline contracts,
So that new enhancement types do not require a separate processing architecture.

**Requirements:** FR18, NFR6, NFR7, UX-DR14

**Acceptance Criteria:**

**Given** a new profile declares supported media, ordered stages, parameters, capabilities, model adapters, and metrics
**When** the profile is registered
**Then** the editor, job coordinator, progress events, history, cancellation, retry, and output flows can consume it through shared typed contracts.

**Given** a music or mixed-audio profile is unavailable or unsupported
**When** the user views profile choices
**Then** the profile is marked unavailable with an actionable explanation
**And** existing speech profiles remain usable.

**Given** a future profile is selected
**When** its stages are displayed
**Then** each stage remains independently visible and reviewable where supported
**And** no special-case job or history state is introduced.

**Given** existing speech fixtures and profiles are tested
**When** future profile support is added
**Then** existing speech behavior and profile interpretation remain unchanged.

### Story 5.5: Cross-Platform History and Cleanup Behavior

As a user on Windows, macOS, or Linux,
I want history and cleanup actions to reflect platform capabilities,
So that local file management behaves predictably on my system.

**Requirements:** FR14, FR16, NFR11, UX-DR9, UX-DR13

**Acceptance Criteria:**

**Given** the application detects the current operating system and browser capabilities
**When** history actions render
**Then** supported actions such as Show in folder, Copy output path, and save/reveal behavior are enabled only when available.

**Given** a platform cannot reveal a folder from the browser
**When** the user opens an output action menu
**Then** Copy output path and supported save actions remain available
**And** the unavailable action includes a plain-language explanation.

**Given** a local history store is reopened after application restart
**When** records are loaded
**Then** statuses, retry links, output availability, and cleanup state remain consistent with local files and reconciled jobs.
