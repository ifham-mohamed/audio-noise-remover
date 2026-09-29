---
title: 'Story 4.2 — Produce and Validate an Immutable Output'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '37fb840'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-4-context.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/specs/spec-ai-noice-removal/implementation-contract.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/planning-artifacts/architecture/architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md'
---

## Intent

**Problem:** Story 4.1 can persist and monitor final jobs, but the app has no executor, so it cannot produce a real final result. Users need one honest, end-to-end final export path that never confuses source or preview bytes with enhanced output.

**Approach:** Add an explicitly experimental, local-only full-file worker route for supported mono/stereo WAV input, noise-removal-only profile, and WAV output. The pinned DPDFNet2 candidate remains unqualified and must be labeled experimental. Fail closed for formats, stages, durations, sizes, or output targets the current browser/WASM path cannot safely validate; do not silently disable an enabled stage. Retain source, temporary, and validated output blobs in separate IndexedDB records. Emit `succeeded` only after FFmpeg encodes the complete enhanced signal and independent WAV metadata/size/duration checks pass. Keep the source immutable. Other media/output profiles remain unavailable until their full-stream worker paths are implemented and tested.

## Boundaries & Constraints

**Always:** worker performs decode/model/encode locally; API receives metadata only; FFmpeg remains the media boundary; CPU/WASM is the baseline; capability checks must be real; typed coordinator is sole lifecycle writer; artifact ID is not a source path; verify output container, sample rate, channels, duration, and byte count; experimental/not-production-qualified status follows output through the UI; cleanup on every failure/cancel; never present source or preview as final output.

**Never:** overwrite source; infer success from worker completion alone; enable video/MP3/FLAC/M4A or unsupported effects without a complete validated path; claim production model quality; expose temporary or failed artifacts.

## Acceptance

- Given supported WAV input, enabled noise-removal stage, supported experimental model, and local WAV output profile, when final processing runs, then the full source duration is processed and visible progress is emitted.
- Given successful processing, when FFmpeg encodes and the artifact validator checks the complete output, then a distinct local artifact is retained and only its metadata is sent to the coordinator before `succeeded`.
- Given an unsupported profile, missing/mismatched model, invalid output, capacity/storage failure, or resource limit, when processing is attempted, then it fails with a safe actionable error, cleans temporary artifacts, leaves source unchanged, and exposes no output.
- Given the successful artifact is shown, then it is identified as experimental/not production-qualified and distinct from bounded preview.

## Implementation tasks

- [x] Define final-worker request/event schemas and supported-profile capability predicate.
- [x] Add full-file local worker decode, experimental inference, FFmpeg WAV encode, progress, and strict cleanup. Cancellation is implemented in Story 4.3.
- [x] Add durable local source/output artifact stores with separate IDs and validated WAV reopening.
- [x] Wire final job creation, browser worker dispatch, coordinator progress/success/failure events, and output readiness gate.
- [x] Test valid full-file output and profile gates, corrupt/truncated output, missing model path, resource limits, worker errors, cleanup, source immutability, and local-only API payloads.
- [x] Verify final output contains a changed processed signal and reject mismatched pinned-model bytes without retaining output.
- [x] Run worker output-format verification, focused tests, typecheck, lint, build, and real-browser E2E; explicitly defer unsupported formats/stages rather than marking them passed.

## Open implementation limits

Production quality remains unqualified. This story deliberately delivers a constrained valid experimental path, not blanket final support for the intake format matrix. Video output, compressed output formats, multi-stage profiles, and broader full-duration/memory qualification remain disabled until separately verified.

## Implementation notes and verification

- Added a dedicated local IndexedDB store for source files and immutable final output artifacts; these stores are separate from preview artifacts. The worker processes the complete source file (not a preview segment) for WAV-only input up to 128 MB and 120 seconds, applies the exact enabled noise-removal stage, encodes mono 48 kHz PCM24 through the bundled FFmpeg core, validates RIFF/WAVE chunks and exact duration, and returns bytes only to browser-local IndexedDB.
- The coordinator accepts `succeeded` only for the supported experimental profile and matching safe output metadata. The API receives job/event metadata only. The UI labels the result experimental and not production-qualified.
- Browser E2E with the pinned local model passed a real one-second WAV decode → inference → PCM24 encode → IndexedDB retain/validate → coordinator success flow, including a signal-level comparison against its source. Separate browser cases fail closed for a missing or hash-mismatched model and confirm that no final output is retained. The existing `npm run verify:ffmpeg` also tests FFmpeg PCM24 encoding and its extensible WAV header. The full unit suite passed (154 tests), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:ffmpeg`, and all three targeted Edge E2E cases passed.
- Adversarial review findings patched: local source snapshots are keyed by unique attempt ID, failure actions conform to the shared schema, unexpected worker failure sequences are read from coordinator state, worker processing survives route unmount, uncommitted artifacts are removed after failed handoff, and IndexedDB `add` prevents overwriting immutable source/output IDs. Cancellation remains Story 4.3.
- Not a production-quality pass: the model is still experimental and misses the required VoiceBank+DEMAND STOI gate. Video, MP3, FLAC, M4A, longer-than-120-second files, additional enabled effects, and broader device memory/performance coverage remain fail-closed and deferred.

## Open Questions

- What source-media retention duration should local retry support use, and when should original bytes be removed? Preserve source bytes for the forthcoming Story 4.4 retry flow until this policy is decided; do not silently add a retention rule.

## Review Triage Log

- `medium / patch` — The local WAV validator could accept a truncated/oversized `fmt ` chunk from a bounded source read; chunk ends are now checked against both declared RIFF size and available bytes.
- `medium / patch` — The output validator accepted duplicate `fmt ` or `data` chunks; it now rejects ambiguous audio layout.
- `medium / patch` — Artifact metadata accepted unsafe or non-WAV filenames; storage validation now requires a safe `.wav` filename.
- `medium / patch` — The UI stored an oversized source before dispatch could reject it; the actual `File.size` is checked before storing/starting.
- `medium / patch` — Disabled processing did not identify the specific size, duration, format, or profile constraint; the UI now explains the applicable restriction.
- `medium / false` — Unknown channel metadata was claimed to be treated as mono and trusted. Metadata is not the processing authority: the worker independently inspects the actual WAV `fmt ` channel count and rejects anything other than mono/stereo before decode or output.
- `medium / patch` — Invalid source WAV/channel/duration failures were surfaced as generic processing failures; these source-profile violations now use the actionable `UNSUPPORTED_MEDIA` code and settings action.
- `medium / patch` — The test only asserted a WAV artifact existed, so a source-copy regression could pass; browser E2E now decodes source and output and checks the signal changed.
- `medium / patch` — The successful output test did not exercise pinned-model integrity failure; an E2E case supplies mismatched model bytes and verifies failure with no output retained.
- `medium / defer` — The output is retained and shown as metadata but not yet retrievable/downloadable. Retrieval belongs to planned Story 4.5; implement and test it there rather than conflating it with output production.
- `medium / defer` — Source bytes remain locally retained to support retries, but retention duration/deletion policy is unresolved and must not be invented. Resolve the open question alongside retry/recovery in Story 4.4.
