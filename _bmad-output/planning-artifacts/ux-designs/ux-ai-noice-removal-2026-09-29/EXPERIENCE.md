---
name: Clearwave Studio
status: final
sources:
  - ../../../specs/spec-ai-noice-removal/SPEC.md
  - ../../../specs/spec-ai-noice-removal/implementation-contract.md
  - ../architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md
updated: 2026-09-29
---

# Clearwave Studio — Experience Spine

> Complete responsive web experience for local speech-first audio/video enhancement. Paired with `DESIGN.md`; the experience owns information architecture, behavior, state, journeys, and accessibility. The architecture and product specification win on conflicts.

## Foundation

Responsive local web application built with Next.js App Router, React, Tailwind CSS, and shadcn/ui. The primary workflow is desktop/laptop because waveform editing and independent controls need space, but intake, monitoring, history, and settings remain usable on tablet and mobile.

The app has one persistent shell and one local trust boundary. A visible “On this device” status is present in the shell. No surface implies cloud sync, account identity, remote processing, or upload progress.

The central product loop is:

`Add media → Inspect → Enhance → Preview → Process → Review output`

The user can leave that loop for History or Settings and return without losing the current draft profile. A job is the source of truth for processing state; UI state reflects typed events rather than guessing from elapsed time.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| New enhancement / Intake | App open, shell primary action | Add local audio/video, validate it, and show metadata |
| Enhance editor | Validated media card | Tune independent effects and output profile |
| Preview workspace | Editor Preview action | Compare bounded before/after audio with waveform/timeline |
| Processing run | Editor Process action or active-job banner | Follow progress, cancel safely, and see terminal outcome |
| Result review | Successful processing state/history row | Play, inspect profile, reveal/save output, start another enhancement |
| History | Shell navigation | Browse local attempts, outputs, failures, cancellation, and retry links |
| Settings | Shell navigation / local badge | Storage, runtime readiness, output defaults, appearance, accessibility, cleanup |
| Diagnostics detail | Settings readiness cards / error details | Inspect FFmpeg, model, disk, permissions, and browser capability information |

The shell navigation has New enhancement, History, and Settings. The active job appears as a compact status item beneath the primary action while work is running. On small screens, the navigation is a shadcn `Sheet` and the active job becomes a top-level banner.

## Voice and Tone

Microcopy is calm, direct, and specific. The app should sound like a careful audio technician, never like a magic filter.

| Do | Don't |
|---|---|
| “Your files stay on this device.” | “Your privacy is our priority!” |
| “Remove steady background noise” | “AI Noise Magic” |
| “Preview ready — this is a short sample.” | “Your audio is perfect!” |
| “Cancelling… finishing the current step.” | “Cancel now” when cancellation is cooperative |
| “Couldn’t create the output. Your original is unchanged.” | “Something went wrong.” |
| “Retry with the same settings” | “Try again” without describing what will happen |
| “No enhancements yet.” | “Nothing here!” |

Error copy follows: what happened, what is safe, and the next action. Never expose raw stack traces in the primary UI; diagnostics can be expanded or copied from Settings/history.

## Component Patterns

### Shell and local trust

The shell includes product mark, current surface title, local badge, appearance control, and navigation. The local badge is keyboard-focusable and opens a popover with: “Processing happens on this device. Media, models, temporary files, outputs, history, and logs stay local.” If capability checks fail, the badge changes to “Local setup needs attention” and links to Diagnostics.

### Intake and file upload

The intake surface opens with a focused drop zone and a secondary Browse action. Accept MP3, WAV, M4A, FLAC, MP4, MOV, and MKV. The drop zone supports drag-and-drop and keyboard activation; Browse invokes the platform file picker. Never require drag-and-drop.

After selection, replace the empty zone with a media card and validation status:

1. `Inspecting file…`
2. `Ready to enhance` with duration, size, media type, audio stream, and output destination summary.
3. An actionable error such as `This file has no readable audio stream.`

For video, show “Audio track found” and optionally a representative still; do not make video playback the primary editing surface. The user can replace/remove the file before entering the editor.

### Editor and independent effects

The editor has a media header, waveform/timeline, transport controls, effect stack, and output section. The effect stack contains four independent cards in explicit pipeline order:

1. Noise removal
2. Voice clarity
3. Loudness normalization
4. Echo/reverb reduction

Each card has an enabled switch, intensity or parameter control, a short explanation, a reset action, and an advanced disclosure only when parameters exist. A disabled stage is visually muted and omitted from the normalized profile. Presets may set multiple controls, but each control remains individually editable and the resulting profile is reviewable.

The right inspector shows `Pipeline order` and a compact “What will run” summary. It must never call a combined control “AI enhancement” without listing the actual stages.

The output section requires an explicit output profile: format/container, quality or bitrate where applicable, destination, and overwrite behavior. If the chosen destination already exists, show a warning before processing.

### Waveform, timeline, and playback

The timeline is a semantic composite, not only a canvas: a waveform visualization, time ruler, playhead, preview-range markers, and text time readout. Provide zoom controls only when supported; otherwise keep a stable bounded preview window.

Before preview exists, the waveform shows the source only. After preview succeeds, users can choose `Before`, `After`, or `A/B`. `A/B` synchronizes playback position and exposes a visible divider or paired waveform tracks. The comparison is always labeled `Preview` and includes the sample duration.

Transport controls support play/pause, seek, mute, and A/B selection. Keyboard operation includes Space for play/pause, Left/Right for small seeks, Shift+Left/Right for larger seeks, and `B` to toggle before/after when focus is outside a text field. All shortcuts are discoverable and can be disabled in Settings.

### Preview

Preview is a primary editor action alongside Process, not a hidden side effect. On activation, show `Preparing preview…`, then stage-level progress. The user may cancel preview; cancellation returns to the editor without a final output. When ready, show the preview workspace inline or as a full-width editor mode with `Back to controls`.

Preview failures retain the media and profile draft. The error names the failed stage and offers `Retry preview` and `Open diagnostics`.

### Processing and progress

Starting final processing creates a job and moves the UI to a processing state while preserving a read-only snapshot of the profile. The progress card shows:

- status text: Queued, Preparing media, Removing noise, Clarifying voice, Normalizing loudness, Reducing echo/reverb, Encoding output, Validating output, or Cleaning up;
- determinate percentage when available, otherwise an indeterminate but labeled activity state;
- current stage and elapsed time;
- cancel action;
- expandable details with job ID, selected profile, and local runtime diagnostics.

Cancellation is a two-step behavioral state: the user requests it, the action becomes `Cancelling…`, and the interface explains that the current step is finishing. Terminal `Cancelled` confirms no successful output was created and offers `Retry with the same settings` or `Back to editor`.

Success shows an output card with `Preview output`, `Open output`, `Show in folder` where supported, `Copy output path`, and `Enhance another`. The original media card remains identifiable and unchanged.

Failure shows a plain-language cause, stable error category, safe-state statement, and actions appropriate to the failure: `Retry`, `Change settings`, `Open diagnostics`, or `Back to editor`. Retry always creates a new linked attempt.

### History

History defaults to newest first and includes search/filter controls for status, media type, date range, and profile. Each row has filename, type, duration, processed date, status, and output action. Expand a row to show the applied effects, model/runtime summary, job ID, and diagnostics.

History states:

- Empty: “No enhancements yet. Add a file to create your first result.”
- Active: “Processing” with live status and `View run`.
- Succeeded: output actions and `Use settings again`.
- Failed: failure reason, `Retry`, and `Open diagnostics`.
- Cancelled: cancellation reason and `Retry`.
- Recovered after restart: “This run stopped when the app closed.” with safe retry.

Cleanup actions clearly name the target: `Remove preview`, `Remove output`, `Clear history metadata`, or `Remove all generated files`. Never offer an ambiguous `Delete` action, and never include the immutable original in generated-file cleanup.

### Settings and diagnostics

Settings uses grouped cards:

- **Appearance:** system/dark/light, density, reduced motion, waveform contrast.
- **Playback:** keyboard shortcuts, seek interval, autoplay preview toggle.
- **Output:** default format, quality, destination, overwrite confirmation.
- **Local processing:** FFmpeg version/status, model availability/version/license, CPU/accelerator provider, writable storage, free space.
- **Privacy and cleanup:** local processing explanation, preview/output retention, clear generated files, clear history metadata.
- **Accessibility:** announcements verbosity, high-contrast waveform mode, focus behavior, motion setting.

Diagnostics is readable without technical expertise. It presents `Ready`, `Needs attention`, or `Unavailable`, then a short explanation and an optional details disclosure. A copy-diagnostics action excludes media content and secrets.

Output defaults are explicit: 48 kHz WAV PCM 24-bit for audio, source-container video with AAC 192 kbps audio when supported, and MP4/H.264/AAC fallback when required. Successful outputs remain until the user removes them; previews older than 7 days are eligible for automatic cleanup; history metadata remains until the user clears it. Destination selection uses File System Access API when available and otherwise uses browser save/download plus Copy output path.

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| First launch | Intake | Welcome statement, local badge, capability check, drop zone, one primary action |
| Cold load | Any | Skeleton for shell and surface; preserve local draft if present |
| No media | Intake | Large drop zone and supported formats; no empty dashboard metrics |
| Inspecting | Intake | Progress text and disabled editor action; cancel/remove remains available |
| Ready | Intake/editor | Metadata card, clear next action, no fake progress |
| Unsupported media | Intake | Inline error with supported list and replace action |
| Editor draft | Editor | Unsaved profile changes are local to the draft; reset and preview are available |
| Preview running | Preview/editor | Stage progress, cancel, no final-output language |
| Preview ready | Preview | A/B controls, bounded sample label, process action remains available |
| Queued | Processing | Position/queued text if known, cancel action, profile snapshot |
| Running | Processing | Stage label, progress, elapsed time, cancel |
| Cancelling | Processing | Disabled duplicate actions, explanatory text, no success affordance |
| Succeeded | Result/history | Output actions, applied profile, enhance another |
| Failed | Result/history | Safe-state statement, error cause, retry/change-settings/diagnostics |
| Cancelled | Result/history | No-output confirmation, retry/back action |
| Restart recovered | History | Explicit recovery reason and safe retry |
| Runtime unavailable | Shell/settings | Local badge warning, blocked process action, diagnostics route |
| Low disk space | Editor/process | Warning before run; identify required space and cleanup route |
| Destination exists | Output settings | Explicit overwrite warning and alternate destination action |

## Interaction Primitives

- `Tab` and `Shift+Tab` follow the visual reading order; `Enter` and `Space` activate controls; arrow keys operate sliders, tabs, segmented controls, and waveform seek where focused.
- `Esc` closes the topmost popover, drawer, or dialog and returns focus to the trigger. Never stack dialogs.
- `Ctrl/Cmd+Enter` starts the final process when the editor is valid; the shortcut is announced and can be disabled.
- `Space` controls playback only when focus is on the waveform/transport region, never inside a text input.
- `Ctrl/Cmd+K` opens a command palette for New enhancement, History, Settings, active job, and cleanup actions. It is optional convenience, not the only navigation path.
- Drag-and-drop is additive; every drag action has a keyboard and Browse equivalent.
- Destructive cleanup requires a confirmation dialog that states exact files/metadata affected. Cancellation and retry do not require confirmation because the original is immutable.
- Toasts do not carry essential information. Job state, errors, and success actions remain in the page structure.

## Accessibility Floor

- Meet WCAG 2.2 AA for the responsive web interface, including text, controls, focus indicators, and semantic status.
- Every effect has a visible label, accessible description, enabled state, current value, and reset action. Sliders expose a meaningful value and unit.
- The waveform has a text alternative with duration, current time, preview bounds, and before/after selection. Provide buttons for seek and A/B rather than requiring canvas interaction.
- Use landmarks: `header`, `nav`, `main`, `aside` for inspector, and `footer`/action region where appropriate. Announce surface changes with a heading and polite live region.
- Job transitions are announced: `Processing queued`, `Removing noise, 42 percent`, `Cancellation requested`, `Output ready`, or `Processing failed: model unavailable`.
- Status combines icon, text, and pattern/position; color is never the sole signal. Maintain contrast in both light and dark themes.
- Focus is visible against all surfaces and never trapped except within an open modal/dialog. Focus returns to the invoking control after close.
- Respect `prefers-reduced-motion`; replace pulsing/progress animation with static state and text. Do not autoplay audio.
- Minimum target size is 44×44 CSS px for touch actions. Keep destructive actions separated from primary processing actions.
- Support browser zoom and large text without clipped filenames, truncated errors, or inaccessible horizontal scrolling.
- Announce errors near the failed control and provide a summary at the top of the editor when multiple errors block processing.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| `≥ 1280px` | Full shell, waveform/editor left, effect inspector right, history table with expanded metadata |
| `1024–1279px` | Compact rail, two-column editor with narrower inspector, settings cards in two columns |
| `768–1023px` | Icon rail, inspector in drawer, history becomes stacked rows, preview stays full-width |
| `< 768px` | Sheet navigation, single-column editor, bottom action bar, effect cards stacked, history rows become cards |

Browser file selection and output reveal behavior are capability-driven. Where a browser cannot expose a local folder action, show `Copy output path` and the supported save action instead. Video preview can degrade to audio-first preview with a media-type explanation.

## Inspiration & Anti-patterns

- **Lifted from pro audio editors:** waveform-centered editing, explicit transport controls, and stage-aware progress; simplified so the user never has to understand a track graph.
- **Lifted from shadcn/ui:** accessible primitives, clear focus behavior, dialogs, sheets, tabs, switches, sliders, toasts, and command palette.
- **Rejected — one-click black-box “enhance”:** the product promise is understandable, independently controlled processing.
- **Rejected — upload dashboard metaphors:** no cloud queue, account avatar, subscription prompts, or remote progress language.
- **Rejected — destructive editor behavior:** originals remain immutable and every output is a new artifact.
- **Rejected — audio-only assumptions:** video inputs are first-class at intake and output, while the editing core remains audio-first.

## Key Flows

### Flow 1 — First local enhancement (Nadia, documentary editor, laptop)

1. Nadia opens Clearwave for the first time and sees “Your files stay on this device” beside the local badge.
2. She drops an MP4 into the intake zone; the app inspects it and reports a 12-minute video with one stereo audio stream.
3. She enters Enhance and sees the waveform, transport, and four independent effect cards. Noise removal and voice clarity are enabled; loudness and echo/reverb are off.
4. She adjusts noise removal, runs a bounded Preview, and listens to the A/B result around the marked preview range.
5. She starts Process, watches the named stages, and leaves the browser tab open while the local job runs.
6. **Climax:** the output is validated and the result card lets her play the processed preview, copy the output path, and open the generated file while the original MP4 remains clearly marked unchanged.

Failure: FFmpeg is missing → the local badge becomes `Local setup needs attention`, the process action is blocked, and Diagnostics explains how to provide a verified binary without losing Nadia’s selected file or draft profile.

### Flow 2 — Cancellation and retry (Marco, podcast producer)

1. Marco opens History and selects a prior failed run.
2. The expanded row shows `Processing failed: disk space low`, the source is safe, and the output was not created.
3. He opens Settings, clears generated previews, returns to the row, and chooses `Retry with the same settings`.
4. A new linked attempt appears in History; the old failure remains as an audit trail.
5. During encoding, he presses Cancel. The card changes to `Cancelling… finishing the current step.`
6. **Climax:** the run ends as `Cancelled`, confirms no successful output was created, and offers a clear retry action without changing the source or silently reusing the old attempt.

### Flow 3 — Accessible keyboard session (Asha, screen-reader and keyboard user)

1. Asha opens the intake surface and uses Tab to reach Browse, selects a WAV, and hears the inspection result announced.
2. She tabs through effect cards; each switch and slider announces its label, enabled state, value, and unit.
3. She uses the text-labeled transport buttons rather than the waveform canvas, starts Preview with `Ctrl/Cmd+Enter`, and hears stage progress in the live region.
4. She cancels Preview with the visible button, then returns to the editor with focus restored to Preview.
5. **Climax:** after processing succeeds, the screen reader announces `Output ready`; the result actions are in reading order and the output path can be copied without relying on color or hover.

### Flow 4 — Speech video to future mixed-audio profile (Leena, post-production lead)

1. Leena selects a MOV and sees a clear audio-stream summary before editing.
2. She uses the speech profile now, with stage cards showing the exact pipeline order.
3. In a future release, she selects a Mixed audio profile. The same editor shell presents additional registered stages—music separation and ambience preservation—without changing job progress, history, cancellation, or output behavior.
4. **Climax:** her previous speech profiles remain reproducible and the new profile is visibly identified as a different pipeline, not a silent reinterpretation of old settings.

## Product-specific concerns

- **Trust:** local-only processing is visible at intake, during processing, in settings, and on output; never imply an upload.
- **Safety:** originals are immutable; failed/cancelled runs never expose a successful output; cleanup names exact scope.
- **Privacy:** filenames and paths are user content; keep them local and avoid unnecessary telemetry or logs.
- **Quality expectations:** preview is bounded and non-final; final success requires validated output and an applied-profile summary.
- **Future extensibility:** music and mixed-audio stages appear as registered profile capabilities, not special-case UI branches.
