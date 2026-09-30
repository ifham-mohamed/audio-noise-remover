# Full local recording verification — 2026-10-01

Actual opt-in Edge browser run with the user's 297.06-second mono 48 kHz WAV. Private source bytes, output and detailed report stay local under ignored `tmp/recording-benchmark/`; none are committed or sent outside the local application. This is processing/playability evidence, not a listening or production-model quality pass.

| Measurement | Observed result |
| --- | --- |
| Browser / OS | Edge 154.0.4258.48; Windows 10.0.26100 x64 (Windows 11 host) |
| CPU | Intel Core i5-1135G7, 2.40 GHz |
| Enabled stages | Experimental DPDFNet2 noise removal 60%; presence EQ 50%; loudness target −16 LUFS |
| Validated output | WAV PCM24, 297.06 seconds, separate `clear-speech.wav` |
| Processing coordinator elapsed time | 258.413 seconds |
| Measured click-to-success wall time | 261.271 seconds (about 4 min 21 sec) |
| Sampled peak Edge working set | 1,365,037,056 bytes (about 1.27 GiB), 87 samples |
| Integrity / privacy | Output digest verified after download; source digest unchanged; HTTP requests stayed on the local application origin |
| Actual loudness-stage result | −25.023 LUFS; +7.096 dB gain; estimated true peak −2.000 dBTP |
| Target limitation | −16 LUFS was not reached because peak protection constrained gain; no clipping/limiting was silently introduced |
| Human listening | Not tested; residual fan noise, speech damage and perceived clarity require audition |

Working set was sampled every three seconds across Edge processes descended from the test worker. It excludes server/OS totals and can miss instantaneous peaks; it is not a memory guarantee. The loudness value uses the implemented approximate meter, not certified conformance evidence. No echo stage was enabled for this recording.

A separate actual inference-time cancellation passed: coordinator state `cancelled`, zero retained final outputs, source digest unchanged, 13.787 seconds recorded elapsed. This browser test did not observe Narrator speech; the user's separate operational report is in `manual-verification.md`.

An earlier run failed status-saving before output publication. After rebuilding the latest adapters with bounded monotonic stage progress, the full run and cancellation both passed. The earlier generic failure does not prove a unique root cause. The successful download also exposed a Windows test-server file-watcher `EBUSY` warning; the Vite harness now excludes private `tmp/` and generated `.next/` directories from watching.

Reproduce only with an explicitly selected local recording:

```powershell
$env:AI_NOICE_BENCHMARK_AUDIO_PATH = 'C:\your-local-recordings\speech.wav'
npm run build
npx playwright test tests/e2e/recording-benchmark.pw.ts
```

The test saves a new uniquely named local run directory, validates actual output and playback metadata, records performance, and separately cancels after inference starts. Without the opt-in environment variable these private-recording tests are skipped.
