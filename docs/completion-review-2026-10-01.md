# Pending-work completion review — 2026-10-01

This review distinguishes implemented local experimental behavior from production and human-verification claims.

| Requested work | Disposition |
| --- | --- |
| Story 3.2 Narrator checks | Done for approved experimental scope, based on the user's five-state confirmation and supplied Edge version; exact speech was not transcribed |
| Epic 2 tracker | Done; Epic 3 is also reconciled after Story 3.2 closure |
| Full private recording | Actual 297.06-second output validated and saved locally; source integrity, performance/memory sampling and inference cancellation passed; human listening remains open |
| Speech model qualification | Fail-closed evidence workflow and aggregate audit implemented; DPDFNet2 remains unqualified, with existing failed/missing gates retained |
| Loudness and echo/reverb | Implemented in independent ordered preview/final stages, with metrics, validation and cancellation; reverb remains explicitly experimental, loudness metering is not certified |
| Compressed audio/video final exports | WAV, FLAC, MP3, M4A and bounded MP4/MOV/MKV paths implemented and tested; copied video packets/timestamps validated, unsupported delayed/shifted timing fails closed |
| Device checks / retention / runtime | User-reported Windows Narrator acceptance recorded; retention/cleanup and browser-authoritative FFmpeg decisions documented and diagnostics implemented; unobserved real-device scenarios remain not tested |

## Executed verification

- 388 unit tests passed across 39 files.
- 41 active Edge browser tests passed in the full suite; three additional actual-worker timing rejection tests passed separately. The two opt-in private-recording tests are intentionally skipped without a selected file.
- Both opt-in private-recording tests passed in their separate run: actual complete enhancement/download and actual inference-time cancellation with zero output.
- Declared type checking, lint, production build and bundled FFmpeg verification passed. The repository's lint configuration excludes TypeScript/TSX; passing lint does not claim those files were linted. They are covered by type checking and applicable tests.
- Earlier full-suite test failures were repaired by awaiting History navigation before reload and scoping output actions to the exact attempt, rather than assuming an empty shared history. Actual format encoding had succeeded during those failures.
- Windows test-server watching excludes ignored private/generated folders after a download exposed a file-lock warning. Final browser verification ran without that warning.

## Still open; not silently waived

Production model approval requires independent rights/provenance and candidate-training overlap review, lawful PESQ evidence and every retained quality gate. One private recording and synthetic DSP fixtures cannot satisfy those requirements. Representative clean/room speech listening and certified meter comparison remain needed before stronger effect-quality claims.

Human audition must assess residual fan noise and speech damage. Real macOS/Linux processing and assistive-technology checks, plus broader Windows history/cleanup/final-output reader scenarios, remain unverified. User-reported Story 3.2 success is not full accessibility certification.

General delayed-track/nonzero-origin video synchronization remains unsupported and visibly rejected. Representative chapter/metadata preservation fixtures remain pending; configured copying alone is not proof. Direct save-to-arbitrary-file remains deferred until original-source identity and no-overwrite guarantees exist; browser downloads are the implemented safe retrieval path.

See [recording verification](recording-verification.md), [manual checks](manual-verification.md), [model qualification](model-qualification.md), [runtime policy](ffmpeg-runtime.md), [retention](source-retention.md), and the current section of `_bmad-output/implementation-artifacts/deferred-work.md` for evidence and ownership. Private media/results, `AGENTS.md` and `next-env.d.ts` are excluded from these commits.
