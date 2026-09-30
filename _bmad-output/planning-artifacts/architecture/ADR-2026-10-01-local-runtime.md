# ADR — Authoritative local browser runtime

Date: 2026-10-01

Status: Accepted (user-delegated runtime decision)

## Context

The architecture's cold-start stack named native FFmpeg 9.0.2. The implemented local inspection, preview, and final workers load bundled FFmpeg 5.1.4 from the same-origin `/ffmpeg/` assets. The approved browser-worker placement keeps selected media out of API requests; the server coordinator still owns job state. Treating native installation as a browser prerequisite misrepresents the actual processing boundary.

## Decision

Bundled browser FFmpeg **5.1.4** is the authoritative local media demux/decode/encode runtime for supported browser processing. Pin and verify the generated assets and build provenance; evaluate upgrades through adapter and fixture verification. Native FFmpeg is optional for diagnostics and developer fixture tooling. No native FFmpeg 9.0.2 minimum is required for browser processing. Native version/availability cannot establish browser codec support or browser readiness.

Keep media local, run FFmpeg only behind worker/media adapters, preserve CPU-safe execution and immutable originals, and relay typed metadata/events to coordinator-owned lifecycle state. Runtime choice does not qualify an enhancement model or make preview completion final-output success.

Recorded results show the expanded browser core build and core verifier passed on 2026-10-01, with generated runtime, FFmpeg/binding/LAME source archives, and licenses (including LAME's) copied into the local bundle. The inspected recipe uses native FLAC/AAC encoders and LAME 3.100 (`ffmpegwasm/lame` mirror commit `2badea1974ae36cb8312afe99cff1e6b3b5decee`) for `libmp3lame` 192 kbps output. It enables FLAC, MP3, ipod/M4A, MOV, MP4, Matroska, and streamhash muxers alongside WAV/raw-float. The build retains the intended LGPL constraints without GPL/nonfree options. Recorded verification passes FLAC, MP3, and M4A encode/decode roundtrips and MOV, MKV, and MP4 AAC remux with identical video-stream packet hashes. The verifier runs the bundled FFmpeg 5.1.4 WASM core in a Node.js harness; it does not establish a dependency on, or version equivalence with, native system FFmpeg.

Source-video output preserves all video packets, metadata, and chapters, with only the selected enhanced audio encoded as AAC 192 kbps. Unselected audio, subtitles, data streams, and attachments are explicitly omitted, with UI disclosure. Copy video streams without re-encoding; no H.264 re-encoding fallback is adopted. Unsupported remux fails visibly rather than substituting a transcode. Packet preservation using streamhash passed for the recorded MOV/MKV/MP4 fixtures; metadata/chapters, selected enhanced audio, and disclosed stream omissions still require their own browser/product acceptance evidence.

Retain full local retry-source copies until explicit linked-data cleanup, following the earlier user instruction “Remove linked local data too.” No source expiry is introduced. Exact current scopes, protected active data, partial failures, and original-file exclusions are documented in [source-retention.md](../../../docs/source-retention.md).

## Consequences and verification

Browser processing is evaluated against the bundled core even if native FFmpeg is absent or a different version. The implemented capability detector verifies both local runtime files against the version-pinned `public/ffmpeg/runtime-manifest.json` SHA-256 entries before reporting Browser FFmpeg Ready. Invalid/missing/mismatched assets or manifest report Unavailable; optional native tooling is reported separately and is Limited when missing. Model-manifest availability does not establish production qualification or successful inference.

Regenerate the manifest from the exact exported JS/WASM bytes after every intentional core rebuild, and distribute the runtime, manifest, and source/license materials together after verification. `.gitattributes` applies `-text` to both generated core files to prevent Git line-ending conversion, including with `core.autocrlf`, from changing checked-out bytes and invalidating hashes. Preserve those attributes and do not format generated assets. The [runtime recipe](../../../docs/ffmpeg-runtime.md) documents hash regeneration and integrity checks.

Use the declared `verify:ffmpeg` to reproduce the recorded core results and fixture/browser checks for selected enhanced audio, metadata/chapters, cancellation, cleanup, and artifact publication. The documentation records the completed core verification without claiming a new local rerun or complete browser acceptance. Story 3.2 is done for its experimental scope following the direct user-reported Narrator operational pass for progress, ready, cancelling, cancelled, and retry; exact speech was not transcribed or independently observed. Physical macOS/Linux checks remain not tested; see [manual-verification.md](../../../docs/manual-verification.md). Production model qualification is unchanged.

Distributions must retain appropriate notices and corresponding-source/build materials for the actual bundled components, including any newly added encoder libraries. Configure flags and an LGPL configure summary are build evidence, not licensing certification or a promise of redistribution compliance. Licensing review remains a separate follow-up.

Build/provenance and current capability limits: [ffmpeg-runtime.md](../../../docs/ffmpeg-runtime.md). Design authorities read for this decision: `architecture-ai-noice-removal-2026-09-29/ARCHITECTURE-SPINE.md` and `../../specs/spec-ai-noice-removal/implementation-contract.md`.
