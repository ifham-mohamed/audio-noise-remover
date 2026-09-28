# Reviewer Gate — Technology and Freshness Review

## Verdict

Pass. The selected stack matches the local browser requirement and was checked against official documentation and current package metadata on 2026-09-29.

## Findings

- Next.js current documentation supports macOS, Windows/WSL, and Linux and requires Node.js 20.9 or newer.
- Tailwind current Next.js documentation uses Tailwind CSS v4 setup.
- shadcn/ui current documentation supports Next.js with current Tailwind and React versions.
- ONNX Runtime Node.js documents CPU binaries across Windows, Linux, and macOS x64/arm64, with optional provider-specific acceleration.
- FFmpeg official download documentation identifies the 9.0.2 stable line as current on the verification date.

## Implementation note

Exact dependency lockfile versions must be committed during scaffolding. Model files need a separate license and checksum record before inclusion in a release.
