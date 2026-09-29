# Epic 2 Context: Add Media and Tune Speech Enhancement

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let users bring supported local audio or video into Clearwave, understand what will be processed, configure independent speech enhancement stages, and define a safe output profile without leaving the local product boundary.

## Stories

- Story 2.1: Select and Inspect Local Media
- Story 2.2: Review Media Card and Video Audio Stream
- Story 2.3: Configure Independent Speech Effects
- Story 2.4: Use Waveform, Timeline, and Transport Controls
- Story 2.5: Define and Validate Output Profile

## Requirements & Constraints

- Support MP3, WAV, M4A, FLAC, MP4, MOV, and MKV through local file selection; never imply upload, account, cloud sync, or remote processing.
- Inspect selected media before processing and expose media type, duration, file size, audio stream details, and actionable readiness or error state.
- Keep the original immutable and retain the selected source locally; no processing job may be created before validation succeeds.
- Keep format-specific handling behind the FFmpeg/media adapter; UI and AI code use typed shared contracts and do not import filesystem or media-tool primitives.
- Treat video as a first-class input while keeping the editing workflow audio-first; future stream selection, speech stages, and mixed-audio profiles must fit the shared profile/job boundaries.
- Maintain keyboard, screen-reader, touch, zoom, reduced-motion, visible-focus, and color-independent status behavior throughout intake and editor surfaces.

## Technical Decisions

- Use the Next.js App Router and React UI with a local file reference passed through typed shared contracts.
- Use a staged intake state: empty, inspecting, ready, or actionable error. Inspection is local and asynchronous from the UI perspective.
- Use stable user-safe error categories such as `UNSUPPORTED_MEDIA` and `PROCESSING_FAILED`; do not expose raw stack traces or media content.
- FFmpeg is the only media demux/decode/encode boundary. Internally, the audio path will normalize to canonical PCM in later stories.
- CPU-safe capability behavior remains the baseline; missing runtime capabilities should preserve selection/draft safety and route users to diagnostics rather than silently failing.
- Do not introduce a database, cloud storage, speculative model family, or future music-specific UI in this intake story.

## UX & Interaction Patterns

- Intake opens with a keyboard-accessible drop zone, a Browse action, supported-format guidance, and a plain-language local-processing explanation. Drag-and-drop is additive, never required.
- On selection, show `Inspecting file…`; then show a media card with filename, type, duration, size, audio stream, and `Ready to enhance`, or a stable actionable error with replace/remove.
- For video, identify that an audio track was found and keep the primary surface audio-first; do not require video playback to validate the input.
- Preserve calm, direct copy: explain what happened, what remains safe, and the next action. Keep all essential actions visible and at least 44px.

## Cross-Story Dependencies

- Epic 1 supplies the shell, local trust badge, capability diagnostics, local settings, responsive layout, and accessibility behavior.
- Story 2.1 establishes the validated media/intake state consumed by Story 2.2’s media card and Story 2.3’s editor.
- Story 2.2 owns detailed video stream review; Story 2.1 should expose enough stream summary to establish readiness without duplicating stream-selection behavior.
- Stories 2.3–2.5 consume the validated media reference and extend the normalized processing/output profile.
