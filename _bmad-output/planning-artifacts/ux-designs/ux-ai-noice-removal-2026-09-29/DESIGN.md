---
name: Clearwave Studio
description: Calm, local-first workspace for restoring speech in audio and video.
colors:
  surface-base: '#0B1016'
  surface-raised: '#121A23'
  surface-elevated: '#192532'
  surface-soft: '#202E3D'
  ink-primary: '#F4F7FA'
  ink-secondary: '#AAB8C5'
  ink-muted: '#748596'
  border: '#2A3B4A'
  primary: '#35D6C2'
  primary-foreground: '#06211F'
  primary-hover: '#62E5D5'
  secondary: '#9B8CFF'
  secondary-soft: '#322F59'
  success: '#63D391'
  warning: '#F0B35E'
  danger: '#FF7C89'
  light-surface-base: '#F4F7F8'
  light-surface-raised: '#FFFFFF'
  light-surface-elevated: '#EAF0F2'
  light-ink-primary: '#10202B'
  light-ink-secondary: '#526574'
  light-border: '#CAD6DD'
  light-primary: '#087F73'
  light-primary-foreground: '#FFFFFF'
typography:
  display:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: 40px
    fontWeight: '650'
    lineHeight: '1.05'
    letterSpacing: -0.03em
  headline:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: 24px
    fontWeight: '650'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  body:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '550'
    lineHeight: '1.3'
    letterSpacing: 0.02em
  mono:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: 12px
    fontWeight: '450'
    lineHeight: '1.4'
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
  full: 9999px
spacing:
  unit: 4px
  gutter-mobile: 16px
  gutter-desktop: 28px
  section: 32px
  panel: 20px
components:
  app-shell:
    background: '{colors.surface-base}'
    foreground: '{colors.ink-primary}'
  primary-button:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  secondary-button:
    background: '{colors.surface-elevated}'
    foreground: '{colors.ink-primary}'
    border: '{colors.border}'
    radius: '{rounded.md}'
  effect-card:
    background: '{colors.surface-raised}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
  waveform-active:
    foreground: '{colors.primary}'
  waveform-before:
    foreground: '{colors.ink-muted}'
  waveform-after:
    foreground: '{colors.secondary}'
  status-success:
    foreground: '{colors.success}'
  status-warning:
    foreground: '{colors.warning}'
  status-danger:
    foreground: '{colors.danger}'
---

## Brand & Style

Clearwave Studio should feel like a quiet, capable editing room: technical enough to earn trust, warm enough to invite experimentation. The visual posture is **calm precision**. A dark studio canvas keeps attention on the waveform and makes the teal processing action feel alive; restrained violet marks the intelligence of the enhancement pipeline without turning the interface into a sci-fi dashboard.

The product is local-first, so privacy is part of the visual identity rather than a legal footnote. A small persistent “On this device” indicator, a lock-shaped local badge, and plain language about storage should be visible without competing with the work.

Clearwave inherits shadcn/ui behavior and primitives. This document defines the brand-layer delta: palette, typography, density, waveform language, effect cards, and job-status treatment. Unlisted shadcn tokens and component behavior remain the foundation.

## Colors

- **Deep studio (`{colors.surface-base}`)** is the primary canvas. Use it for the shell and empty space around media.
- **Raised panels (`{colors.surface-raised}` and `{colors.surface-elevated}`)** create hierarchy through tone, not heavy borders.
- **Clear teal (`{colors.primary}`)** means “ready to act” and is reserved for primary actions, active playback position, enabled processing, and successful completion highlights. It is never decorative.
- **Signal violet (`{colors.secondary}`)** identifies before/after comparison and model-powered enhancement. It is not used for errors or generic navigation.
- **Success, warning, and danger** use semantic text, icons, and patterns together. Never communicate job state through color alone.
- Light mode uses the paired `light-*` tokens with the same semantic roles; users may choose system, dark, or light appearance.

## Typography

Geist is the functional voice: clean, compact, and legible in a dense editor. `{typography.display}` is used only for the first-run welcome and empty-state hero. `{typography.headline}` names surfaces and jobs. `{typography.body}` carries explanations and control labels. `{typography.label}` is used for compact section labels, never for paragraphs. `{typography.mono}` is reserved for durations, sample rates, model versions, and diagnostics.

Never use all caps for whole sentences. Preserve readable line length and allow text to wrap at the largest browser text setting.

## Layout & Spacing

The desktop shell is a three-zone frame: compact left navigation, flexible central workspace, and contextual right inspector where the current surface needs it. The editor is the anchor: media preview and waveform receive the largest area; effect controls remain visible beside them on wide screens.

Use a 4px base rhythm. Apply `{spacing.gutter-desktop}` around the workspace and `{spacing.gutter-mobile}` on small screens. Major sections use `{spacing.section}`; controls inside a card use the tighter `{spacing.panel}` rhythm.

At `lg` (1024px+), show the left rail and two-column editor. At `md` (768–1023px), collapse navigation to an icon rail and keep the inspector as a drawer. Below `md`, stack the preview, timeline, controls, and output sections; keep the primary action sticky at the bottom with safe-area padding.

## Elevation & Depth

Use tonal layering first. Shadows are soft and low opacity, reserved for floating popovers, dialogs, and the active inspector drawer. Do not make every card float. A selected effect card uses a 1px teal outline and a subtle teal-tinted inner glow; a processing card uses a quiet animated edge only when reduced motion is not requested.

## Shapes

Use `{rounded.sm}` for inputs and compact rows, `{rounded.md}` for buttons and badges, `{rounded.lg}` for effect cards and media panels, and `{rounded.xl}` for large empty-state panels. Full pills are limited to status labels and filter chips. The overall surface should feel engineered and soft, not bubbly.

## Components

- **App shell:** left rail with Clearwave mark, New enhancement, History, and Settings. The current destination has a teal rail marker and text label; mobile uses a `Sheet`.
- **Local badge:** compact lock icon plus “On this device”. It opens a popover explaining that media never leaves the laptop and links to Settings diagnostics.
- **Drop zone:** large dashed or low-contrast bordered panel with upload icon, “Drop audio or video here”, supported-format hint, and a secondary Browse button. On hover/focus, border becomes `{colors.primary}`.
- **Media card:** filename, type, duration, file size, audio-stream summary, replace/remove actions, and a local path privacy note. Video cards show a still frame only if available; the audio waveform remains primary.
- **Waveform/timeline:** dark neutral waveform for the source, teal for the played/active region, violet overlay for the processed comparison, and a high-contrast cursor. Markers show preview bounds and current time. A text time readout always accompanies the visual timeline.
- **Transport controls:** Play/Pause, seek backward/forward, A/B toggle, mute, and time display. Keyboard shortcuts are documented in a tooltip and Settings.
- **Effect card:** title, short plain-language explanation, enabled switch, intensity/parameter control, “Reset” action, capability status, and optional advanced disclosure. Each card exposes one effect only.
- **Before/after control:** segmented A/B toggle and draggable comparison divider when the preview supports it. Keep a text alternative: “Before” and “After” buttons.
- **Progress card:** phase label, determinate progress when available, current stage, elapsed time, cancel button, and expandable details. Terminal states use icon + text + semantic color/pattern.
- **History row:** media name, profile summary, date, duration, status, output action, retry, and overflow cleanup action. Rows expand to show applied effects and diagnostic reason.
- **Setting row:** label, short explanation, current value, and control. Destructive cleanup uses a confirmation dialog with the exact scope.
- **Toast:** short-lived confirmation only for non-blocking events. Persistent errors remain inline at the point of action and in history.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep the waveform and current processing state visually central | Turn the home screen into a marketing hero before the user can add media |
| Use teal for the next meaningful action and violet for comparison | Use accent colors as decoration or as the only state signal |
| Explain model, storage, and privacy status in plain language | Hide local-only behavior in a settings subpage |
| Let shadcn primitives carry dialogs, tabs, switches, sliders, and focus behavior | Rebuild basic controls with bespoke untested interactions |
| Use quiet transitions and honor reduced motion | Animate waveforms, cards, or progress continuously for spectacle |
| Keep effect controls independent and scannable | Combine four effects into one opaque “magic” slider |
