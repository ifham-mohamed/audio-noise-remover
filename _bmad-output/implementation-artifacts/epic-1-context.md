# Epic 1 Context: Trustworthy Local Workspace

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver the first usable local workspace: a responsive Clearwave Studio shell that makes the local-only trust boundary visible, reports whether the local runtime is ready, provides settings and diagnostics, and remains operable with keyboard, screen reader, touch, zoom, and reduced-motion preferences.

## Stories

- Story 1.1: Local Application Shell and Navigation
- Story 1.2: Local Runtime Readiness and Diagnostics
- Story 1.3: Appearance, Playback, Output, and Accessibility Settings
- Story 1.4: Responsive and Accessible Shell Behavior

## Requirements & Constraints

- Processing stays local; the shell must not imply accounts, upload, cloud sync, or remote processing.
- The shell exposes New enhancement, History, Settings, current surface title, active-job access, and an “On this device” trust indicator.
- Capability readiness includes FFmpeg, model availability/version, CPU or accelerator provider, writable storage, free space, OS, and browser support; CPU is the safe fallback.
- Settings cover appearance, playback, output, local processing, privacy/cleanup, and accessibility.
- Windows, macOS, and Linux behavior is capability-driven.
- The UI must support keyboard operation, visible focus, semantic labels/status, screen-reader announcements, reduced motion, non-color state communication, zoom, and touch targets of at least 44px.
- Shared TypeScript/Zod contracts govern capability data, errors, and API envelopes; UI code does not import filesystem, FFmpeg, or ONNX primitives.

## Technical Decisions

- Use the single Next.js App Router application boundary with React, Tailwind CSS, and generated shadcn/ui components.
- Keep capability detection and diagnostics behind server/use-case ports and adapters; expose user-safe capability results through typed contracts.
- Use stable error codes and user-safe messages. Diagnostic copy must exclude media bytes, raw audio, full file contents, and secrets.
- Maintain dependency direction: UI → shared contracts → server boundary/use cases → ports/adapters.
- No database or processing worker is needed for shell-only state; persistent settings must remain local and use the project’s storage boundary when introduced.

## UX & Interaction Patterns

- Dark studio is the primary visual direction with paired light mode: deep ink surfaces, teal primary action, violet enhancement/comparison accent, Geist typography, 4px rhythm, and shadcn primitives.
- Desktop uses a navigation rail and spacious workspace; smaller viewports use a compact rail or Sheet. No essential action may be hover-only.
- The local badge opens a plain-language explanation and routes to diagnostics when setup needs attention.
- Settings use grouped cards with visible labels, explanations, current values, and accessible controls.
- Surface changes announce a meaningful heading/state and restore focus after dialogs, popovers, or sheets close.

## Cross-Story Dependencies

- Story 1.1 establishes the shell surfaces used by Stories 1.2–1.4.
- Story 1.2 supplies readiness/diagnostic data used by later intake and processing stories.
- Story 1.3 owns persisted appearance, playback, output, cleanup, and accessibility preferences used by later editor flows.
- Story 1.4 hardens the shell and settings behavior across viewports and input modes; it does not require media processing to exist.
