# Epic 3 Context: Preview and Compare Improvements

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let users safely evaluate their current speech-enhancement profile on a short, bounded sample before committing to a final output. The preview must remain local, clearly distinguishable from final processing, and preserve enough profile and timing context for later comparison and diagnosis.

## Stories

- Story 3.1: Create a Bounded Preview
- Story 3.2: Show Preview Progress, Cancellation, and Failure
- Story 3.3: Compare Before-and-After Preview Audio

## Requirements & Constraints

Preview is a first-class editor action after media validation, effect configuration, timeline selection, and output-profile validation. It uses local media only and must not upload media, decoded audio, model inputs, outputs, or media-derived telemetry. A preview is a bounded derived artifact, never a final output; it must not overwrite the source or imply that final processing succeeded. Preview metadata must preserve the normalized stage order, enabled settings, model versions, output semantics, selected range, and source identity needed to reproduce or explain the result.

The experience should use explicit states such as preparing, queued/running, ready, cancelled, and failed. Progress, cancellation, retry, and errors are part of the epic, but each story should own only its stated slice. All status must be conveyed with text, icons, and accessible announcements rather than color alone. CPU-safe local execution and capability-driven behavior remain the baseline.

## Technical Decisions

The job coordinator owns preview lifecycle and history-facing state; UI and adapters communicate through shared TypeScript/Zod contracts. FFmpeg remains the demux/decode/encode boundary and canonical PCM is used inside the audio pipeline. Enhancement stages are explicit ordered records with enabled state, validated parameters, capability requirements, cancellation behavior, version, and metrics. AI work stays behind model adapters. Preview completion must remain separate from final-output success and should use a distinct typed job/artifact identity.

Use the existing media, processing-profile, effect, timeline, and output-profile contracts rather than duplicating their vocabulary. Preserve originals through temporary validated artifacts and atomic publication rules. Stable error codes and typed IDs are required where errors or retries cross boundaries.

## UX & Interaction Patterns

Preview is a primary action beside Process. On activation, show “Preparing preview…” and a clearly labeled Preview surface with the selected range, bounded duration, active profile summary, and local-only messaging. The waveform/timeline remains central; preview bounds are visible markers with a text time readout. When ready, the UI can expose Before/After/A/B controls, but the sample duration and Preview label must remain visible. Use the Clearwave Tailwind/shadcn visual language: raised calm panels, teal for ready-to-act states, violet for comparison, visible focus, keyboard alternatives, polite live-region announcements, minimum 44px targets, and reduced-motion behavior.

## Cross-Story Dependencies

Story 3.1 depends on the validated media and normalized enhancement/output profiles from Epic 2. Story 3.2 extends the preview job with progress, cooperative cancellation, terminal failure, and retry behavior. Story 3.3 consumes a ready preview artifact to implement synchronized before/after playback and comparison controls. Final processing in Epic 4 must reuse the same profile semantics without treating a preview artifact as a final output.
