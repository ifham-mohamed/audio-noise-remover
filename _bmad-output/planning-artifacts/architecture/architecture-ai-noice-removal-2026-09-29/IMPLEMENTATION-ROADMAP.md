# Implementation Roadmap — AI Noise Removal

## Milestone 1 — Foundation

Deliver a clean local Next.js shell with the design system, health screen, shared schemas, and setup/doctor commands.

## Milestone 2 — Safe media workflow

Deliver file selection, media inspection, video-to-audio extraction, output profiles, atomic file writing, and a basic job progress UI.

## Milestone 3 — Speech denoising

Deliver the first CPU-safe ONNX speech denoising profile with quality fixtures and a measurable before/after result.

## Milestone 4 — Controlled enhancement studio

Deliver independent controls for noise removal, clarity, loudness, echo/reverb, and enhancement, plus preview and waveform/timeline feedback.

## Milestone 5 — Reliability and platform readiness

Deliver cancellation, retry, recovery, history cleanup, storage checks, accessibility hardening, and Windows/macOS/Linux verification.

## Milestone 6 — Release and expansion

Deliver production build instructions, model/license attribution, regression suite, performance baselines, and the design for music/mixed-audio profiles.

## Recommended implementation order

1. Scaffold and contracts.
2. Capability detection and diagnostics.
3. FFmpeg media adapter.
4. Job coordinator and local history.
5. Minimal denoising adapter.
6. Processing controls and preview.
7. Cross-platform hardening.
8. Release and future profiles.

The first usable release should be speech-focused, local-only, and safe with originals. Music support should be a later profile rather than a hidden promise in the speech pipeline.
