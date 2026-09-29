# Local speech model artifact

The preview candidate is Ceva DPDFNet2 48 kHz full-band ONNX, pinned to Hugging Face revision `c7ac7b249ff5e17fa606794dc4f68ed9a544834f`. Its model card declares Apache-2.0. It builds on DeepFilterNet2 with Dual-Path RNN blocks; it is a candidate artifact, not a qualified production default.

Run `npm run model:setup` when network access is available to download the model into the ignored `models/` directory. Setup verifies SHA-256 `7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b` before atomically publishing the file and writing the local manifest. Processing must not fetch the model or runtime from a network/CDN; after setup, model inference is local and CPU-safe.

The bake-off has not passed the full speech quality gate: the 100-clip VoiceBank+DEMAND result missed median STOI improvement, PESQ remains unverified, and blinded listening was mixed across sets. This artifact may be used only for an explicitly experimental local preview while those gates remain visible; do not claim production qualification.

The browser media core is a custom, reduced LGPL build rather than the commonly published GPL `@ffmpeg/core` package. See [the runtime and format limits](./ffmpeg-runtime.md). It can decode locally for preview preparation, but the worker intentionally does not expose decoded audio as an enhanced preview while the model and enabled-stage quality gates remain open.
