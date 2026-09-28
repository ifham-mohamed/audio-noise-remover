# Setup and Run — AI Noise Removal

This document is the planned developer setup for the first implementation stage. Exact commands may be refined when the repository is scaffolded.

## Requirements

- Windows, macOS, or Linux.
- Node.js 24.19.x recommended; Node.js 20.9+ minimum.
- npm 11.x.
- Local FFmpeg 9.0.2 or a verified compatible binary.
- Enough disk space for the input, temporary work, output, and local models.

## First setup

```bash
git clone <repository-url>
cd ai-noice-removal
npm install
npm run setup
npm run doctor
npm run dev
```

Open `http://localhost:3000` in a modern browser.

## Planned scripts

```bash
npm run dev             # start the local Next.js server
npm run build           # create a production build
npm run start           # run the production local server
npm run setup           # verify/provision local runtime assets and models
npm run doctor          # diagnose Node, FFmpeg, models, paths, and storage
npm run lint            # lint source
npm run typecheck       # run TypeScript checks
npm test                # unit and integration tests
npm run test:e2e        # browser flow tests
npm run clean           # remove generated temporary/cache data only
```

## Privacy and file behavior

- Files are processed on the laptop.
- Inputs are read-only.
- Outputs are written separately through a temporary file and atomic rename.
- Model files and job history remain local.
- Logs contain job IDs and diagnostics, never raw media content.
- The settings screen provides history and temporary-file cleanup.

## Troubleshooting

Run `npm run doctor` first. It should identify missing FFmpeg, missing model assets, unsupported architecture, insufficient storage, inaccessible paths, and unavailable acceleration. CPU mode is the fallback.
