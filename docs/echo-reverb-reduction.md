# Experimental echo/reverb reduction

`features/processing/echo-reverb-reduction.ts` implements local CPU spectral late-tail suppression, version `spectral-late-tail-v1-experimental`. It uses the existing `fft.js` dependency; no model, network, filesystem, or job-state access. Synthetic evidence supports opt-in experimental use, not production or model qualification. The effect is integrated into the UI, preview processing and final export, with experimental limitations shown to the user.

## Product integration and cancellation

The speech editor exposes an independent echo/reverb enable switch and intensity control. The stage is off by default, with intensity 40 when enabled, and is marked experimental with uncertified listening quality. Preview and final workers both call `runSpeechPipeline`, which validates and orders enabled stages as noise removal, voice clarity, loudness normalization, then echo/reverb reduction. Disabled stages are omitted. Final output metrics retain the algorithm version, mean spectral gain, headroom scale and experimental flag. A completed preview remains a bounded comparison artifact; final success requires encoded-output validation and coordinator acceptance.

The shared pipeline checks its optional AbortSignal before and after every stage and forwards it to the echo/reverb adapter. The adapter checks cancellation at entry, each spectral frame, after cooperative yields, and before and after the completion callback. The preview worker supplies its active AbortSignal; a cancel message aborts that signal and terminates active FFmpeg processing. Preview cancellation checks also surround processing and output construction, and the client waits for the terminal event before disposing of its worker.

Final cancellation uses termination of the dedicated final worker rather than an AbortSignal passed into that worker's pipeline call. The runner suppresses incoming messages during a cancellation request, drains its queued event handling and waits for the coordinator to acknowledge `cancelling` before terminating the worker. It then confirms the current job state and sends the `cancelled` event. Termination stops DSP and discards worker-local processing state without waiting for a cooperative signal checkpoint; it must not be described as running the worker's `finally` cleanup. Late success messages are excluded by the runner and coordinator, so an acknowledged cancellation cannot publish a successful output. If cancellation confirmation fails after termination, confirmation can be retried while the job remains `cancelling`.

## API

```ts
applyEchoReverbReduction(
  input: Float32Array,
  sampleRate: number,
  options: {
    intensity: number;
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
  },
): Promise<{
  samples: Float32Array;
  metrics: {
    algorithmVersion: "spectral-late-tail-v1-experimental";
    qualification: "experimental";
    framesProcessed: number;
    meanSpectralGain: number;
    headroomScale: number;
  };
}>;
```

The input must be already decoded, mono, finite normalized PCM in [-1, 1], exactly 48,000 Hz. The adapter cannot detect incorrectly interleaved stereo; the caller owns channel validation. Intensity is a finite number from 0 through 100 (fractional values permitted). Zero validates and returns a bit-exact independent copy. Empty input succeeds. All successful results preserve length and alignment and leave the source unchanged. Nonzero processing uniformly scales peaks exceeding 0.999 to that ceiling, without hard clipping. Zero-intensity bypass preserves existing full-scale samples exactly.

Invalid PCM/rate/intensity rejects with TypeError or RangeError. Signal-based adapter cancellation rejects with `name: "AbortError"`, `code: "CANCELLED"` and returns no partial samples. Progress is monotonic from 0 to 1, local to this stage; the coordinator owns job events. CPU loops yield to the event loop every 16 spectral frames and every 262,144 samples in full-buffer passes. Aborting in the completion callback still rejects. A progress callback that throws also rejects. Product cancellation and publication guards are described above; dedicated final-worker termination does not return an adapter rejection.

`echoReverbReductionDeclaration` exports the version, experimental qualification, format, CPU requirement, intensity range and cancellation support. `meanSpectralGain` is the unweighted mean of all frame/bin gains, including silent bins; it is diagnostic, not a measured reverb or intelligibility improvement. `headroomScale` separately identifies uniform output attenuation.

## Algorithm

2048-sample STFT, 512-sample hop, sine analysis/synthesis windows, complex phase retained, normalized overlap-add with zero padding at both ends. Per-bin input power updates a decaying historical peak envelope, stored in a six-frame (64 ms) delay ring. The fixed decay prior loses 60 dB of energy in 900 ms; this is not an estimate of the recording's RT60.

A bin is eligible for suppression only when its present power falls below half its delayed historical envelope. The relative deficit controls attenuation continuously. Intensity interpolates the target amplitude gain between unity and a floor of 0.55 (at most 5.19 dB attenuation). Attenuation is temporally smoothed; rising/strong bins release immediately to their target. This suppresses weak delayed spectral energy while protecting strong or novel direct speech. It is neither a static EQ nor a broadband silence gate. The simultaneous two-band test checks selective attenuation while another band carries fresh content.

The function processes a whole buffer with independent state per invocation. Do not invoke independently on successive streaming chunks: that resets the history and boundary windows. Working storage is linear in clip length (two Float64Array accumulators and one Float32Array output, approximately 20 bytes per sample beyond the source, plus fixed spectral state); this is not a bounded streaming adapter.

CPU work is O(N) for this fixed FFT size, with approximately ceil((N + 1536) / 512) frames and one forward/inverse FFT per frame. Work between cooperative yields is bounded by 16 frames or 262,144 samples; wall-clock cancellation latency is not guaranteed under scheduler contention. Whole-buffer allocations and the zero-intensity copy remain synchronous O(N) operations. One minute of 48 kHz mono input requires about 57.6 MB of adapter sample storage beyond the source, excluding allocation/runtime overhead. Large clips remain limited by available memory.

Intensity scaling and window squares are precomputed once per invocation instead of repeatedly inside frame/bin loops. This preserves the measured DSP results and the existing yield frequency. Bit-exact test comparisons use Uint32 views (including signed zero and nonzero byte offsets), avoiding generic deep comparisons of large sample arrays. Only the four-intensity loop has a 20-second test timeout to allow parallel browser/unit contention; other test timeouts and DSP quality thresholds are unchanged. A parallel echo/speech-pipeline run passed all 12 tests, with the loop taking 1.71 seconds; this is a local observation, not a throughput guarantee or a controlled speedup measurement.

## Reproducible evidence

Run `npm test -- tests/echo-reverb-reduction.test.ts --reporter=verbose --disableConsoleIntercept`.

Tests use deterministic 48 kHz harmonic speech-like bursts with changing pitch, formant-shaped harmonics and unvoiced onsets, convolved with synthetic reflection taps. At intensity 100:

| Synthetic reflection fixture | Reflection-only energy reduction | Whole-clip squared-error improvement vs dry | Absolute direct-window energy change |
| --- | ---: | ---: | ---: |
| Four signed taps, 80–297 ms | 2.345 dB | 0.992 dB | 0.0013 dB |
| One 120 ms, gain 0.4 tap | 2.168 dB | 1.065 dB | 0.0015 dB |
| Three positive taps, 95–281 ms | 2.399 dB | 1.087 dB | 0.0015 dB |
| 32 signed decaying taps, 65–415 ms | 2.294 dB | 0.939 dB | 0.0019 dB |

Reflection-only windows span 250–520 ms after each burst's start; dry speech ends at 220 ms. Direct windows span 20–60 ms, preceding the first reflection. Error improvement uses the known dry reference over the entire clip, with no optimal gain fitting. All four runs have headroomScale=1, so benefits do not come from uniform attenuation. Gates require >2 dB tail reduction, >0.5 dB squared-error improvement, and <1 dB absolute direct-window energy change.

Clean synthetic speech reconstruction SNR is 35.54 dB, with gates of >20 dB SNR and <1 dB total-energy change. Additional tests cover sustained-tone preservation, simultaneous novel-band protection, increasing suppression at intensities 0/25/50/100, exact bypass, immutability, length, finite unclipped output, silence, DC, impulses, short buffers, input rejection, progress and cancellation races. These ten focused tests passed on Windows. No macOS/Linux runtime measurement or recorded-speech evaluation is claimed.

## Limitations

This is a conservative heuristic for weak late reflections following stronger speech. It does not estimate/invert a room impulse response, reconstruct masked direct speech, or cancel acoustic feedback using a reference signal. Strong discrete echoes, early reflections, continuous speech overlapping reverberation, long room decays and changing rooms may receive little benefit. Naturally decaying clean syllables or instruments can be attenuated; the direct-window measurements above do not prove preservation throughout overlapped speech. Frequency modulation and musical artifacts remain possible despite smoothing and the gain floor.

There are no recorded-room intelligibility, STOI, PESQ, SI-SDR or listening-panel results, and no model qualification. The fixture error metric is ordinary squared error against a known dry reference, not SI-SDR. Music, mixed audio and production release remain unqualified. Real speech/room listening and quality evaluation are required before widening availability or increasing suppression beyond this version's floor.
