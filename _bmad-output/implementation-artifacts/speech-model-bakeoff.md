# Speech Enhancement Model Bake-off

**Status:** Three-window CPU pilot, ONNX Runtime Web WASM execution smoke, browser-worker offline/cancellation smoke, 100-clip VoiceBank+DEMAND comparison, six-speaker EARS synthetic-noise diagnostic, two six-trial blind preference checks, and a 12-clip WHAM real-noise diagnostic complete. DPDFNet clears the exploratory STOI/SI-SDR thresholds on this small WHAM sample but misses STOI on the larger VoiceBank+DEMAND set; the latest EARS blind check preferred GTCRN in all six trials. No production model selected and no candidate has passed all project quality gates.
**Date:** 2026-09-29

## Decision to make

Select a speech denoiser and execution artifact for the local-only speech MVP. Preserve the implementation contract's DeepFilterNet2-derived ONNX target unless a documented quality, licensing, or runtime result justifies revising it. Compare GTCRN as the lightweight challenger and RNNoise as a low-compute baseline. Do not bundle model weights or advertise enhanced output before the independent weight-license review and artifact tests pass.

## Candidate feasibility (desk research, not measured results)

| Candidate | Evidence and fit | Main risks / unresolved checks |
|---|---|---|
| DeepFilterNet2-derived ONNX (lead per existing contract) | Speech-specific, full-band design; upstream CLI documents 48 kHz WAV input and DeepFilterNet2 as the default model. Upstream repository code is dual-licensed MIT/Apache-2.0. | The upstream runtime documented here is Rust/Python, not ONNX Runtime Web. A current upstream issue reports an ONNX export failure for a full DeepFilterNet3 graph; that issue is a warning, not proof all DF2 export paths fail. Confirm the exact checkpoint's license, reproducible conversion, supported ops, browser WASM inference, and runtime factor. |
| DPDFNet2 ONNX (DeepFilterNet2-derived challenger) | Publisher's Apache-2.0 Hugging Face revision is pinned below; its 16/48 kHz artifacts have recorded hashes. Publisher 16 kHz ONNX met STOI/SI-SDR pilot thresholds, and the publisher 48 kHz graph passed browser-WASM worker inference/cancellation smoke. | No full-band quality test on genuine 48 kHz material, app-integrated inference, cold-start offline test, PESQ/clean-speech regression, memory or loudness/clipping gate yet. |
| GTCRN (lightweight challenger) | Official repository reports 48.2K parameters and 33 MMAC/s, offers pretrained checkpoints, and reports CPU streaming results. Its inference example is 16 kHz; the README points to ONNX deployment support through sherpa-onnx. Source repository license is MIT. | These are author-reported numbers, not this project's measurements. 16 kHz input requires an explicit resampling adapter relative to the app's 48 kHz canonical signal. Confirm checkpoint-specific redistribution terms, conversion provenance, ONNX Web operator support, quality on target speech/noise, and end-to-end runtime. |
| RNNoise (control / fallback candidate) | Xiph describes a recurrent neural noise suppressor; its repository is BSD-3-Clause and documents raw mono 48 kHz PCM inference. | Lower-capacity quality baseline, C/WASM integration work, and model weights are downloaded separately by upstream tooling. Verify exact weight provenance and test against the quality gates; do not assume source license alone clears all artifacts. |

Primary references: [DeepFilterNet upstream](https://github.com/Rikorose/DeepFilterNet), [DeepFilterNet ONNX export issue](https://github.com/Rikorose/DeepFilterNet/issues/696), [DPDFNet upstream](https://github.com/ceva-ip/DPDFNet), [pinned DPDFNet publisher artifact revision](https://huggingface.co/Ceva-IP/DPDFNet/tree/c7ac7b249ff5e17fa606794dc4f68ed9a544834f), [DPDFNet model profiles and attenuation-limit behavior](https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/dpdfnet.html), [official DPDFNet ONNX attenuation implementation](https://github.com/ceva-ip/DPDFNet/blob/main/onnx_model/infer_dpdfnet_onnx.py), [official Edinburgh VCTK corpus record](https://datashare.ed.ac.uk/items/30e7453c-9ea8-48b4-8e18-f96d0dc62928), [VCTK CC BY 4.0 license](https://datashare.ed.ac.uk/bitstreams/956a1688-0b59-428c-8a2f-10837433dde3/download), [VCTK 48 kHz rehost card and conversion notes](https://huggingface.co/datasets/philgzl/vctk), [GTCRN upstream](https://github.com/Xiaobin-Rong/gtcrn), [GTCRN inference path](https://github.com/Xiaobin-Rong/gtcrn/blob/main/infer.py), [RNNoise upstream](https://github.com/xiph/rnnoise), [paired DPDFNet evaluation set](https://huggingface.co/datasets/Ceva-IP/DPDFNet_EvalSet), [ITU-T PESQ reference implementation and licensing notice](https://www.itu.int/itu-t/recommendations/rec.aspx?lang=en&rec=8725), and [ONNX Runtime Web performance guidance](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html).

The DPDFNet model publisher's Hugging Face repository labels the model Apache-2.0 and publishes ONNX files. At pinned revision `c7ac7b249ff5e17fa606794dc4f68ed9a544834f`, the publisher records `dpdfnet2_48khz_hr.onnx` as 10,493,337 bytes with SHA-256 `7F0575A5CEC0BA4FFD8F8BD657E06D007E4CCDD955D76FAAB922B9D3291DC14B`; the 16 kHz `dpdfnet2.onnx` at that same revision is 10,178,747 bytes with SHA-256 `4F0EE28935B4A32ABECC717D745416976565834D839601ACF43031094B4DC94C`. The 48 kHz publisher artifact passed the browser-worker smoke below.

Important provenance correction: the initial quality/runtime pilot used DPDFNet artifacts downloaded from the sherpa-onnx release, whose hashes are recorded in the reproduction snapshot; they are not byte-identical to the pinned publisher artifacts above (both sample-rate model sizes and hashes differ). Separate rows report the sherpa 16 kHz result and publisher 16 kHz rerun; do not attribute one artifact's metrics to the other. Before bundling, retain the publisher terms/model card, pinned revision, hash, training-data statement, conversion provenance, and required attribution.

## Initial empirical pilot (not a release-gate result)

Used the DPDFNet evaluation set (its dataset card declares Apache-2.0) and downloaded only three 20-second paired windows to a temporary folder outside the repository: Arabic / airport / 0 dB, German / street / 5 dB, and Korean / office / 10 dB. Each same clean/noisy pair was scored against the set's DeepFilterNet2, DPDFNet2, GTCRN, and RNNoise outputs. GTCRN and DPDFNet2 were also rerun locally from ONNX with sherpa-onnx 1.13.8, one CPU thread. The rerun outputs closely matched the corpus outputs. Measurements below are pilot-window metrics; they are not comparable to the corpus authors' aggregate claims and are not a quality certification.

| Candidate output | Median STOI gain vs noisy | Median SI-SDR gain vs noisy | Median CPU RTF, rerun | ONNX size |
|---|---:|---:|---:|---:|
| DeepFilterNet2 (corpus output) | +0.137 | +11.43 dB | not measured | not tested |
| DPDFNet2 (local 16 kHz ONNX rerun) | +0.158 | +12.34 dB | 0.159 | 10.25 MB downloaded artifact |
| DPDFNet2 (publisher 16 kHz ONNX, pinned revision `c7ac7b2`) | +0.133 | +13.43 dB | 0.161 | 10.18 MB publisher artifact |
| GTCRN (local 16 kHz ONNX rerun) | +0.104 | +8.54 dB | 0.050 | 0.54 MB downloaded artifact |
| RNNoise (corpus output) | +0.083 | +9.25 dB | not measured | not tested |

Median is across only the three named ~20-second windows. STOI/SI-SDR are calculated against the aligned clean reference at 16 kHz. The pinned publisher DPDFNet2 artifact produced median STOI gain +0.133, median SI-SDR gain +13.43 dB, and median CPU RTF 0.161 on these same clips. Compared with the differently sourced sherpa release artifact, its median STOI gain was lower (+0.133 vs +0.158) while median SI-SDR gain was higher (+13.43 vs +12.34 dB); do not mix their scores. GTCRN was about 3.2x faster than the sherpa artifact in this one-thread CPU pilot and much smaller. This small comparison supports further DPDFNet2 evaluation, not final selection.

The sherpa-release native 48 kHz DPDFNet2 ONNX artifact was also smoke-tested on 20-second inputs made by 3x resampling the same 16 kHz noisy clips. Median CPU RTF was 0.344 (about 2.9x faster than real time); it returned finite 48 kHz output with unchanged 20-second duration on all three. Since the source recordings were only 16 kHz, this says nothing about 48 kHz full-band enhancement quality.

## Native 48 kHz full-band exploratory pilot (not a release-gate result)

Used three VCTK test utterances from speakers p230, p260, and p276 for noisy tests, and ten clean utterances from eight speakers for the clean-speech regression probe (two utterances each from p230 and p376). The recordings originate in the University of Edinburgh corpus. The corpus record says recordings were captured at 96 kHz/24-bit then released at 48 kHz/16-bit and licensed CC BY 4.0. To avoid downloading the 10.94 GB complete archive, the short samples were taken from the `philgzl/vctk` rehost, whose card says source FLAC was converted to Opus; the dataset viewer provided 48 kHz decoded WAV samples. This is therefore genuine 48 kHz-rate/full-band content but not lossless source audio. The three noisy-test excerpts had spectral energy above 8 kHz at -26.6, -23.7, and -17.7 dB relative to total energy. We added locally generated slowly modulated broadband Gaussian noise at 0 dB and 5 dB SNR (deterministic seed), and ran the pinned publisher `dpdfnet2_48khz_hr` artifact using sherpa-onnx 1.13.8, CPU/one thread. Only the small fixture audio and derived test data were stored in OS temp, not the repository.

| Condition | Median STOI change/gain | Median SI-SDR change/gain | Median CPU RTF | Peak output |
|---|---:|---:|---:|---:|
| Clean speech, denoiser applied, no attenuation limit (10 utterances / 8 speakers) | -0.0128 STOI (range -0.2293 to -0.0009) | not used as a clean reference delta | 0.215 (3 initial clips only) | <=0.973 |
| 0 dB synthetic broadband noise, no attenuation limit | +0.0803 | +13.35 dB | 0.203 | <=0.867 |
| 5 dB synthetic broadband noise, no attenuation limit | +0.0473 | +10.27 dB | 0.221 | <=0.908 |

The noisy-speech medians exceed the contract's exploratory STOI/SI-SDR thresholds, and all six noisy trials ran faster than real time on this machine. However, only three short speakers and one synthetic noise family were tested. The 10-clean-utterance probe with the default unrestricted suppression produced two severe, repeatable speaker-level outliers: STOI changes were -0.096 and -0.134 on two p230 utterances, and -0.081 and -0.229 on two p376 utterances; other six utterances ranged from -0.016 to -0.001. This prompted a documented offline attenuation-limit sweep.

The sherpa-onnx offline DPDFNet adapter exposes `attenuation_limit_db`: positive values mix a scaled copy of the noisy spectrum back into enhanced output to reduce over-suppression; `0` disables the limit. The project publisher's CLI/API exposes the same family of `attn_limit_db` control. Compared with the default `0`, setting `12 dB` on the publisher 48 kHz model improved clean preservation on the affected examples while keeping the small noisy set above the contract's median exploratory thresholds:

| Test set | No limit (0 dB) median | 12 dB limit median |
|---|---:|---:|
| Clean STOI change (10 utterances / 8 speakers) | -0.0128 (range -0.2293 to -0.0009) | -0.0051 (range -0.0306 to -0.0005) |
| Noisy STOI gain, 0 dB SNR (3 utterances) | +0.0803 | +0.0691 |
| Noisy SI-SDR gain, 0 dB SNR (3 utterances) | +13.35 dB | +9.79 dB |
| Noisy STOI gain, 5 dB SNR (3 utterances) | +0.0473 | +0.0382 |
| Noisy SI-SDR gain, 5 dB SNR (3 utterances) | +10.27 dB | +8.60 dB |

The 12 dB limit reduced suppression strength as expected, but median noisy-speech gates still cleared in these samples. The two worst clean clips were substantially improved: p230_001 STOI change went from -0.096 to -0.031; p376_218 from -0.081 to -0.004. This is evidence for an explicit, bounded suppression-strength parameter in a future offline adapter—not proof that a single default works across speech, real-world noise, formats, or profiles. The 10-clean / six-noisy sweep still lacks PESQ, blind listening, broader content, and statistical power. The package's `attenuation_limit_db` behavior must be reproduced and unit-tested in whichever browser adapter is used; this knob is not an ONNX graph input by itself.

For the original unrestricted runs, the ONNX denoiser output was shorter than input by 9.27 ms, 1.35 ms, and 6.33 ms across the three noisy source excerpts. The 12 dB limit does not remove that trim (same shortfalls observed on the clean set); the production adapter must explicitly account for model latency/length and validate duration after alignment. No output in the original unrestricted noisy test exceeded full scale after input headroom normalization; clipping at the 12 dB setting and across real signals remains unverified.

An isolated Node.js smoke test using `onnxruntime-web` 1.30.0's explicit WASM execution provider successfully created sessions and ran zero-valued tensors through the DPDFNet2 16 kHz, DPDFNet2 48 kHz, and GTCRN ONNX graphs. All expected named outputs were returned; the single first-run calls took 4 ms, 29 ms, and 9 ms respectively on this machine. These are graph/operator compatibility checks only: zero-input smoke latency is not representative inference performance, and Node WASM is not a browser-worker/offline validation. The temporary test package and models remain outside the repository; no product dependency or model selection was changed.

A second isolated smoke used desktop Chrome with the publisher-pinned 48 kHz DPDFNet2 graph (revision and SHA-256 above) loaded in a dedicated Web Worker. The worker initialized ONNX Runtime Web WASM and the model while online; after all runtime/model assets were loaded, the browser context was switched to offline mode (`navigator.onLine === false`). It then executed repeated zero-tensor inference and received a cooperative cancel message, stopping after four inference calls without completing the run. This verifies the test page made no network dependency after initialization and that the publisher graph runs/cancels in this browser setup; it does not test app integration, actual audio quality, cold-start offline model loading, or a production cancellation budget. The first harness attempt also showed that an inference loop which only chains resolved promises can starve incoming cancel messages; yielding to the worker task queue between short batches allowed cancellation to be observed. Production workers must provide such a bounded yield/checkpoint, or use worker termination with cleanup where appropriate.

No PESQ, true-peak, blind listening, peak memory, cold-start offline model loading, actual-media browser enhancement, supported-format integration, or non-Windows cross-platform result was collected. Integrated LUFS was measured in the paired 40-clip evaluation, but no configured loudness target or complete app processing/encoding path exists yet. The attempted Python PESQ binding did not build because this Windows environment lacks the required MSVC C++ toolchain. PESQ is also subject to implementation/licensing constraints; confirm acceptable evaluation rights for this project before selecting a scorer. No sample peak exceeded full scale in the paired pilot; that does not establish the required true-peak or encoded-output clipping gate.

**Reproduction snapshot:** Windows 11 environment; Intel Core i5-1135G7, 19.7 GiB RAM; Python 3.12.10; sherpa-onnx 1.13.8; one CPU inference thread. Sherpa-release model hashes: GTCRN `E77603AC0C23DAC3227DD2D7135B3A585CBEE2679048AECFA886657D3AE1B534`; DPDFNet2 16 kHz `CE35D6025FC71DF0EF10D1540E1B7916837BBFE5F6896DEB744508D2CAD487A9`; DPDFNet2 48 kHz `0B399F8A58DC4D70D8CD97541F5C39869406145193B957D00A03B66070944928`. Publisher revision `c7ac7b2` hashes are above. Artifacts/audio are in a unique OS temp folder, not the repository.

## Reproducible test protocol

1. Obtain a small, permission-cleared speech/noise fixture set. Keep source recordings and derived clips local; record dataset/version/license and hashes. Include clean speech, stationary and non-stationary noise, varied speakers, and clean-speech regression cases. Do not commit restricted recordings.
2. Pin each candidate checkpoint and conversion pipeline by revision, artifact hash, and license evidence. Stop a candidate before inference if artifact rights or provenance remain unclear.
3. Decode once to the same canonical PCM, then apply each candidate's documented resampling/preprocessing in its isolated adapter. Use identical test segments and no candidate-specific manual tuning during the primary pass.
4. Run CPU-only first in the intended local worker/runtime, offline after install. Record cold model-load time, warm real-time factor, peak memory, artifact size, failures, and cancellation responsiveness on a named reference machine/browser. Test multi-threading only as a separately labeled capability, not as the CPU-safe baseline.
5. Report per-clip results and medians; do not collapse metrics into one score. Apply the contract gates: median STOI improvement >= 0.03; median SI-SDR improvement >= 3 dB; clean-speech PESQ regression <= 0.10; zero introduced clipping; loudness within 1 LU of configured target. Also conduct a blinded listening review for speech damage and residual artifacts.
6. Require actual local browser inference with network disabled, worker cancellation/cleanup, stable output duration and channels, validated encoded artifact, and a no-source-overwrite check before a candidate is eligible for product selection.

## Provisional recommendation

Keep publisher-pinned DPDFNet2 as an experimental candidate, not a production selection. Its 16 kHz graph met thresholds on three 16 kHz windows; its 48 kHz graph exceeded exploratory noisy-speech STOI/SI-SDR thresholds on three short VCTK samples and passed isolated browser-worker inference/cancellation. The clean-speech STOI losses were substantially reduced by the documented 12 dB offline attenuation limit, while the small **synthetic-noise** set continued to exceed median gates; implementation of this setting and the output-duration trim remain adapter requirements, not app-verified behavior. The separately sourced sherpa DPDFNet artifact showed higher STOI gain (+0.158 vs +0.133) on the 16 kHz pilot. Keep GTCRN as the efficiency alternative and RNNoise as the low-compute control. No model is approved for shipping/bundling. Remaining gates: PESQ rights/tool and the clean-speech regression threshold, broader real-noise 48 kHz fixtures, loudness/clipping and artifact listening, app-integrated loading/cancellation, cold-start offline behavior, and explicit model approval followed by an implementation-contract update.

## Additional pre-integration checks (2026-09-29)

### Paired real-noise test-set follow-up

The University of Edinburgh DataShare record for the Valentini-Botinhao noisy-speech database describes paired clean/noisy speech designed for 48 kHz enhancement, derived from VCTK speech and including DEMAND noise. It lists separate 147.18 MB clean-test and 162.68 MB noisy-test WAV archives. The item metadata labels its license “End-user Licence,” while the linked license file contains CC BY 4.0 terms. Since those signals are not fully consistent and the source corpora have their own terms, treat the dataset as research/evaluation material only, retain attribution, and do not redistribute clips or add them to this repository. Both archives were downloaded to OS temporary storage, validated (825 entries each, no corrupt ZIP members), and used only for the local evaluation below.

References: [University of Edinburgh dataset record](https://datashare.ed.ac.uk/items/6ed35425-bf14-4d2b-93a1-0a4984952757), [linked CC BY 4.0 license text](https://datashare.ed.ac.uk/bitstreams/7e7bc32f-e94a-436a-8e97-416a972c7e1a/download).

### Paired real-noise 48 kHz pilot

Ran the pinned publisher 48 kHz ONNX (`c7ac7b2`, SHA-256 above) through sherpa-onnx 1.13.8 offline CPU inference, one thread, 12 dB attenuation limit. The sample was the first six lexically sorted matching utterances for each of the two held-out test speakers p232 and p257 (12 utterances total, 1.74–7.18 seconds each). This is an intentionally small, non-random pilot, not an aggregate result for the dataset. Metrics are computed at 48 kHz on duration-aligned samples; clean STOI delta compares enhanced-clean input against the original clean reference.

| Utterance | Noisy STOI gain | Noisy SI-SDR gain (dB) | Clean-input STOI delta | CPU RTF |
|---|---:|---:|---:|---:|
| p232_001 | +0.0054 | +7.69 | -0.0027 | 0.210 |
| p232_002 | +0.0013 | +9.38 | -0.0022 | 0.209 |
| p232_003 | +0.0072 | +10.89 | -0.0017 | 0.210 |
| p232_005 | +0.0321 | +10.46 | -0.0018 | 0.214 |
| p232_006 | +0.0076 | +5.31 | -0.0006 | 0.203 |
| p232_007 | +0.0206 | +5.79 | -0.0011 | 0.209 |
| p257_001 | -0.0060 | -0.96 | -0.0377 | 0.220 |
| p257_002 | -0.0101 | +4.06 | -0.0135 | 0.205 |
| p257_003 | +0.0205 | +9.19 | -0.0025 | 0.221 |
| p257_004 | +0.0136 | +11.26 | -0.0051 | 0.221 |
| p257_006 | +0.0065 | +4.24 | -0.0029 | 0.254 |
| p257_007 | +0.0158 | +5.14 | -0.0023 | 0.246 |

Noisy median STOI gain was **+0.0074**, below the implementation contract's exploratory **+0.03** threshold; median SI-SDR gain was **+6.74 dB**, above its **+3 dB** threshold. Two utterances regressed on noisy STOI and one regressed on SI-SDR. The clean-input STOI delta median was **-0.0024** (worst **-0.0377**); this does not establish the PESQ clean-regression gate. Median CPU RTF was **0.212** (range 0.203–0.254); output duration matched input for all 12. There were no sample values at or above full scale; median sample peak was **0.497**. These 12 runs do not constitute a true-peak or encoded-output clipping test.

Using integrated LUFS on these same excerpts, output loudness moved by a median **-0.105 LU** versus noisy input. Denoising clean input moved loudness by a median **-0.07 LU** versus the original clean clips. This only describes the model's level change; no product loudness target has been selected, so the configured-target gate remains open.

To reduce the lexical-selection bias above, ran a second reproducible sample using `random.Random(20260929)` to select 20 distinct utterances from each test speaker (p232 and p257), with paired noisy and clean references. This is still only two speakers and one test set, but it is the primary paired pilot summary:

| Metric | p232 (n=20) median | p257 (n=20) median | Combined (n=40) median | Combined range |
|---|---:|---:|---:|---:|
| Noisy STOI gain | +0.0154 | +0.0122 | **+0.0143** | -0.0079 to +0.1127 |
| Noisy SI-SDR gain (dB) | +9.15 | +7.80 | **+8.56** | +2.73 to +11.86 |
| Clean-input STOI change | -0.0018 | -0.0068 | **-0.0053** | -0.0387 to approximately 0 |
| CPU RTF | 0.210 | 0.223 | **0.217** | 0.197 to 0.299 |
| Output duration delta (ms) | -4.82 | -3.99 | **-4.04** | -9.98 to 0 |
| Sample peak | 0.499 | 0.499 | **0.499** | 0.475 to 0.517 |
| Integrated loudness shift vs noisy input (LU) | -0.143 | -0.099 | **-0.110** | -1.916 to +0.764 |

Three of 40 noisy STOI results regressed; no noisy SI-SDR result regressed. No output samples reached full scale. The contract's median STOI gate (**>= +0.03**) is **not met** by this paired pilot, while median SI-SDR (**>= +3 dB**) is met. Duration shortfall is consistent and must be explicitly aligned/validated in any adapter. CPU timing is a sherpa native reference, not browser-worker timing. The 12-clip lexicographic table above is supplemental and should not be conflated with this seeded 40-clip sample.

### Attenuation-limit sensitivity on paired speech

To determine whether the STOI miss was specific to the 12 dB setting, ran a separate seeded sample (20 paired utterances per speaker, same speakers) at limits 0, 6, 12, and 20 dB. The noisy profiles used the same 40 inputs; clean preservation used a separate 20-clip subset (10 per speaker). This is a diagnostic sweep on the evaluation set, not an unbiased candidate/profile selection exercise.

| Limit (dB) | Noisy STOI gain median | Noisy SI-SDR gain median (dB) | Noisy STOI regressions / 40 | Clean-input STOI change median (n=20) | Clean minimum | Duration median (ms) |
|---:|---:|---:|---:|---:|---:|---:|
| 0 (unlimited) | +0.0154 | +10.27 | 8 | -0.0107 | -0.0506 | -4.14 |
| 6 | +0.0096 | +5.28 | 2 | -0.0007 | -0.0031 | -4.14 |
| 12 | +0.0130 | +8.68 | 6 | -0.0025 | -0.0098 | -4.14 |
| 20 | +0.0127 | +10.21 | 7 | -0.0054 | -0.0213 | -4.14 |

None of the four settings reached the median noisy-STOI gate of +0.03; all reached the median SI-SDR gate of +3 dB. The 6 dB setting preserved clean-input STOI best in this small subset, but yielded the lowest noisy STOI/SI-SDR gains. Unrestricted suppression had stronger SI-SDR improvement but more noisy-STOI regressions and larger clean-STOI losses. This confirms a quality trade-off rather than establishing a default. Sample peaks remained below full scale (maximum 0.534); output length stayed consistently shorter (worst approximately -9.98 ms). The repeated-session RTF values from this multi-profile sweep are omitted as they are not directly comparable with the single-session benchmark.

### GTCRN paired candidate cross-check

Compared sherpa-release `gtcrn_simple.onnx` against publisher-pinned DPDFNet2 48 kHz at 12 dB on the same seeded 40 paired clips and corresponding clean inputs. Both received the 48 kHz waveform through sherpa-onnx; GTCRN internally resampled to its 16 kHz model rate and returned 16 kHz. To make objective scores comparable, clean/noisy references and DPDFNet output were also resampled to 16 kHz with polyphase resampling before STOI/SI-SDR; this comparison therefore does not evaluate DPDFNet's additional >8 kHz preservation. GTCRN's final 16-to-48 kHz output conversion is required for the app's canonical output and was not included in this isolated inference timing.

| Candidate | Median STOI gain (16 kHz) | Median SI-SDR gain (dB) | Clean-input STOI change median (n=40) | Noisy STOI regressions | CPU RTF median | Output duration delta median |
|---|---:|---:|---:|---:|---:|---:|
| DPDFNet2 48 kHz (12 dB limit) | +0.0143 | +8.52 | -0.0053 | 3/40 | 0.316 | -4.04 ms |
| GTCRN (16 kHz) | -0.0001 | +5.73 | -0.0233 | 20/40 | 0.084 | -7.90 ms |

In this controlled sample, DPDFNet2 had better quality metrics and preserved clean speech better, while GTCRN ran about 3.8 times faster in the native wrapper. Neither passed the noisy STOI gate; GTCRN also had more STOI regressions and a longer output trim. Both had zero sample peaks at or above full scale. Treat this as a two-speaker candidate comparison, not a general ranking: the GTCRN artifact is a sherpa-release artifact, the browser/app path is untested, and the pair does not meet the required broad-content, PESQ, listening, or output-validation gates. DPDFNet is the stronger of these two candidates on this sample, but still not approved to wire as the production denoiser.

### Expanded paired benchmark: 100 utterances

To reduce sampling uncertainty, selected 50 paired utterances per held-out speaker (p232 and p257) with seed `20260930` and ran both candidates on every noisy clip and its clean reference. This independent sample was scored at a common 16 kHz rate; GTCRN's required input resampling and native 16 kHz output are handled by sherpa-onnx, while DPDFNet output and both references are resampled to 16 kHz for metric comparability. The CSV with per-clip measurements is in OS temporary storage, not the repository.

| Candidate | Median noisy STOI gain (P10–P90) | Median SI-SDR gain (dB) | Clean-input STOI change | Median CPU RTF | Median duration delta | STOI regressions |
|---|---:|---:|---:|---:|---:|---:|
| DPDFNet2 48 kHz, 12 dB limit | **+0.0097** (-0.0000 to +0.0405) | **+8.94** | -0.0033 (P10 -0.0102) | 0.329 | -4.53 ms | 10/100 |
| GTCRN 16 kHz | **-0.0014** (-0.0295 to +0.0267) | **+5.40** | -0.0140 (P10 -0.0443) | 0.086 | -8.73 ms | 56/100 |

DPDFNet2's STOI median was +0.0094 for p232 and +0.0097 for p257; neither speaker subset met the +0.03 threshold. Median SI-SDR exceeded +3 dB for both candidates, but the contract's STOI gate remains **failed** for both. DPDFNet2 again outperformed GTCRN on speech-quality measures in this limited test set, at roughly 3.8× the native CPU RTF, and both had zero sample-clipped output values. DPDFNet2 shortened output by up to 9.98 ms; GTCRN by up to 15.92 ms. These results supersede the earlier 40-clip sample as the primary point estimate, but expand utterance count only: the official test split still covers just two speakers and does not establish generalization.

### Training-data provenance and independent-test limitation

The [DPDFNet paper](https://arxiv.org/html/2512.16420v3) states that training used the DNS4 dataset plus 4,000 hours of Multilingual LibriSpeech (MLS), with additional MUSAN and FSD50K noise clips. It evaluates on VoiceBank+DEMAND and the DNS4 blind test, and adds a multilingual stress set built from the Speech-MASSIVE test split with nine environmental scenes at 0/5/10 dB. Therefore the VoiceBank+DEMAND scores above should not be described as demonstrably independent of DPDFNet training: speaker/source overlap has not been ruled out. Our VCTK-derived exploratory pilot also cannot be treated as independent without confirming whether those exact speakers or recordings occurred in the model's training data.

The publisher's [`DPDFNet_EvalSet`](https://huggingface.co/datasets/Ceva-IP/DPDFNet_EvalSet) is a promising broad stress-test candidate: its dataset card describes 324 long-form clips, 12 languages, nine scenes, and clean/noisy references, and lists an Apache-2.0 dataset license. However, the paper says its speech comes from Speech-MASSIVE test data, whose [source repository](https://github.com/hlt-mt/speech-massive) identifies the source corpus as CC-BY-NC-SA-4.0. Until the publisher clarifies rights for the redistributed audio and confirms provenance/separation from model training, do not mirror or redistribute these recordings, and do not treat the Hugging Face dataset-level license label alone as sufficient rights clearance. Even if used for a local research-only diagnostic under applicable terms, it is the model authors' own evaluation set, not a blind independent holdout.

Next benchmark gate: obtain an explicitly rights-reviewed, multi-speaker clean-speech and noise pairing not used to train DPDFNet (or obtain a documented held-out split and source-level rights statement from the publisher); synthesize deterministic mixtures locally with recorded noise/SNR strata; keep source audio outside the repository; publish aggregate metrics and provenance only. If no eligible corpus is available, label any further public-set run as a development diagnostic, not independent validation. The 100-clip two-speaker result remains the current broader measurement, with model-training overlap unresolved.

### Six-speaker EARS held-out synthetic-noise diagnostic

To improve speaker and speaking-style coverage without reusing VoiceBank+DEMAND, evaluated the official EARS test speakers p102–p107. The model paper's stated training recipe names DNS4 and MLS speech plus MUSAN/FSD50K noise; it does not name EARS. This makes EARS the strongest available speaker-disjoint diagnostic found so far, but not a formal proof of zero source overlap. EARS is a 48 kHz mono expressive-speech corpus; the test split was obtained through the `philgzl/ears` mirror, which states that the original WAV was converted to lossy Opus. EARS is licensed CC BY-NC 4.0, so this run is limited to non-commercial research/diagnostics; do not treat these scores as product or commercial performance claims.

Selected six fixed 8-second high-energy excerpts per speaker (36 clean excerpts total): regular and whispered reading, neutral and amazed sentences, freeform speech, and sad freeform speech. Created deterministic local white and amplitude-modulated pink-noise mixtures at 0 dB and 6 dB global signal/noise power (144 noisy pairs per candidate), plus one clean-preservation pass for each excerpt. The model/profile was fixed in advance: pinned publisher DPDFNet2 48 kHz with a 12 dB attenuation limit; GTCRN used the sherpa `gtcrn_simple.onnx` artifact with its 48-to-16 kHz wrapper resampling. STOI was computed at a common 16 kHz rate. SI-SDR was measured at each candidate's returned sample rate (48 kHz for DPDFNet, 16 kHz for GTCRN), so the SI-SDR values are gate diagnostics, not a direct cross-model ranking. One CPU thread was used. Per-excerpt rows and intermediate audio remain in OS temporary storage only.

| Candidate / condition | n | Median STOI gain | P10 STOI gain | STOI regressions | Median SI-SDR gain (native rate) | Median CPU RTF | Median clean-input STOI | Clean P10 / min | Output peak >= 1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DPDFNet, white 0 dB | 36 | +0.0540 | +0.0402 | 0/36 | +9.10 dB | 0.357 | 0.993 overall | 0.969 / 0.958 | 0 |
| DPDFNet, white 6 dB | 36 | +0.0401 | +0.0284 | 0/36 | +6.77 dB | 0.350 | 0.993 overall | 0.969 / 0.958 | 0 |
| DPDFNet, modulated pink 0 dB | 36 | +0.0767 | +0.0427 | 0/36 | +8.39 dB | 0.356 | 0.993 overall | 0.969 / 0.958 | 0 |
| DPDFNet, modulated pink 6 dB | 36 | +0.0558 | +0.0366 | 0/36 | +6.40 dB | 0.363 | 0.993 overall | 0.969 / 0.958 | 0 |
| GTCRN, white 0 dB | 36 | +0.0407 | +0.0084 | 3/36 | +7.74 dB | 0.194 | 0.982 overall | 0.917 / 0.870 | 0 |
| GTCRN, white 6 dB | 36 | +0.0196 | -0.0259 | 6/36 | +5.30 dB | 0.194 | 0.982 overall | 0.917 / 0.870 | 0 |
| GTCRN, modulated pink 0 dB | 36 | +0.0609 | -0.0019 | 4/36 | +5.53 dB | 0.193 | 0.982 overall | 0.917 / 0.870 | 0 |
| GTCRN, modulated pink 6 dB | 36 | +0.0377 | -0.0246 | 4/36 | +4.17 dB | 0.187 | 0.982 overall | 0.917 / 0.870 | 0 |

DPDFNet's median STOI gain exceeded the contract's +0.03 gate in all four synthetic-noise strata; its P10 fell below +0.03 only in white 6 dB. All six speaker-level medians cleared +0.03 in three strata; for white 6 dB, p103 was +0.0295 (the other five speaker medians were above threshold). DPDFNet had no negative STOI-gain trials in the 144 pairs. GTCRN failed the +0.03 median gate in white 6 dB and had 3–6 negative per-clip STOI-gain cases per stratum. Clean-input median STOI was 0.993 for DPDFNet and 0.982 for GTCRN; lowest individual clean scores were 0.958 and 0.870, respectively. DPDFNet's median CPU RTF was about 0.35 and GTCRN's about 0.19 on this machine. Both returned full-duration outputs for these 8-second excerpts and had no sample peaks at or above full scale.

This diagnostic materially strengthens DPDFNet's case for broad speech preservation and synthetic-noise robustness versus GTCRN, but does not erase the real-noise result: DPDFNet's median STOI gain on the 100-clip, two-speaker VoiceBank+DEMAND test was only +0.0097 at the 12 dB setting. The different outcome may reflect real versus synthetic noise, speaker/content, source quality, or test construction; this run cannot isolate the cause. EARS uses Opus-derived clean audio and synthetic white/pink noise rather than real environmental noise; it does not assess PESQ, real-world noise classes, app integration, format boundaries, or listening quality. Keep both results visible. Do not use the synthetic diagnostic alone to select a production default or wire DPDFNet as the qualified production denoiser.

Source notes: [EARS official corpus repository and test-speaker archive](https://github.com/facebookresearch/ears_dataset), [EARS project and benchmark description](https://sp-uhh.github.io/ears_dataset/), [EARS mirror's Opus conversion and split/license details](https://huggingface.co/datasets/philgzl/ears), [sherpa-onnx DPDFNet API](https://csukuangfj.github.io/sherpa/onnx/speech-enhancement/dpdfnet-python-api.html).

### Supplemental ViSQOL speech-mode diagnostic

Because PESQ could not be run and its implementation rights require confirmation, installed the separately licensed `visqol-python==3.8.0` package and its lattice speech-mode dependency into the temporary evaluation environment only. PyPI identifies the package as Apache-2.0; the upstream Google ViSQOL source also identifies Apache-2.0. The implementation claims conformance against the upstream C++ tests, but this project did not independently validate the package's complete conformance suite. ITU-T says P.862/PESQ is out of date and was deleted on 2024-01-05, referring readers to P.863; this is a reason to review the legacy contract gate, not authorization to change it unilaterally.

Scored six per-speaker composite windows (three per speaker, p232/p257), each 8.06–10.64 seconds after joining 3–4 test utterances with 0.5 seconds of silence, at ViSQOL speech mode's 16 kHz input. The same references were scored against noisy, DPDFNet2-12 dB output, and GTCRN output; clean-input preservation compared model-enhanced clean audio to identity (clean vs itself).

| ViSQOL result (MOS-LQO delta) | Median across six windows | Range |
|---|---:|---:|
| DPDFNet2 noisy enhancement vs noisy input | +0.378 | +0.003 to +0.703 |
| GTCRN noisy enhancement vs noisy input | +0.058 | -0.411 to +0.746 |
| DPDFNet2 clean-input output vs identity | -0.423 | -0.757 to -0.078 |
| GTCRN clean-input output vs identity | -1.528 | -1.845 to -1.062 |

This small paired diagnostic favors DPDFNet2 over GTCRN on perceptual MOS-LQO, while also showing a measurable clean-input score reduction for DPDFNet2. ViSQOL scores are not PESQ scores; MOS-LQO deltas cannot be compared with the contract's PESQ regression threshold of 0.10. The results are from six composite windows, only two speakers, and a third-party Python port; they do not clear the PESQ or blinded-listening gate. Google's own guidance describes ViSQOL primarily as a codec/VoIP proxy and cautions that it can perform poorly for some denoising use cases. Use these values only as supplementary evidence.

References: [ViSQOL Python package and claimed license/conformance](https://pypi.org/project/visqol-python/), [Google ViSQOL mode guidance and denoising caveat](https://github.com/google/visqol), [ITU-T P.862 current status](https://www.itu.int/rec/T-REC-P.862).

### Blinded listening review

One reviewer (the project user) completed a six-trial blind preference check. Each trial contained the same noisy utterance rendered as noisy input, DPDFNet2 at the experimental 12 dB attenuation limit, and GTCRN; condition order was randomized independently per trial, and versions were loudness-matched within each trial. The reviewer selected DPDFNet2 in all six trials (6/6): p232_014, p232_016, p232_024, p257_015, p257_101, and p257_019. The mapping key was kept separate until the reviewer submitted choices.

This is a useful subjective signal that DPDFNet was preferred over the noisy input and GTCRN on these six clips. It is not a blinded multi-listener study, covers only two speakers, and does not establish the PESQ/clean-regression gate or broad production quality. Do not use it to override the paired STOI miss or the unresolved objective gate. The WAVs and answer key remain in OS temporary storage and were not added to the repository.

A second six-trial blind preference check used one excerpt per EARS held-out speaker, with noisy input, DPDFNet at 12 dB, and GTCRN in randomized, loudness-matched order. The reviewer selected GTCRN in all six trials (6/6): p102 modulated pink 0 dB, p103 white 6 dB, p104 modulated pink 6 dB, p105 white 0 dB, p106 modulated pink 0 dB, and p107 white 6 dB. This is a notable subjective disagreement with the objective STOI comparison, where DPDFNet had higher median gains across all four noise strata. It is a single-listener, six-clip result and cannot establish general preference, but it argues against selecting DPDFNet based only on STOI and supports keeping GTCRN in the next perceptual comparison. The EARS audio and answer key remain in OS temporary storage and are not committed.

### Small real-environment noise diagnostic: WHAM test split

To add a first real ambient-noise check without downloading the full archive, retrieved six audio rows at spaced positions from the public WHAM 48 kHz test split via its selective dataset-row endpoint. Mixed those six urban/environment recordings independently with six clean VoiceBank test utterances from each of the two held-out speakers (p232 and p257), at 5 dB SNR, for 12 speech/noise pairs. DPDFNet2 used the publisher-pinned 48 kHz artifact at the experimental 12 dB attenuation limit. GTCRN used the existing 16 kHz model through the same sherpa-onnx local CPU denoiser wrapper. STOI was scored at each model's output sample rate against a correctly resampled clean reference; SI-SDR gain was measured after rate alignment and common-length truncation. This is a development diagnostic, not the official EARS-WHAM recipe or a product qualification; it has only two speakers, six noise segments, one SNR, and no PESQ, approved loudness target, or listening panel.

| Candidate | n | Median STOI gain (P10–P90) | Median SI-SDR gain (dB) | STOI regressions | Median CPU RTF | Maximum sample peak |
|---|---:|---:|---:|---:|---:|---:|
| DPDFNet2 48 kHz, 12 dB limit | 12 | +0.0803 (+0.0381–+0.0877) | +7.01 | 0/12 | 0.355 | 0.510 |
| GTCRN 16 kHz | 12 | +0.0374 (+0.0071–+0.0505) | +5.25 | 1/12 | 0.093 | 0.493 |

Both candidates clear the exploratory median STOI (+0.03) and SI-SDR (+3 dB) thresholds on these clips. DPDFNet2 was higher on both medians; GTCRN was about 3.8× faster. Per-speaker STOI medians were +0.0766/+0.0803 for DPDFNet2 and +0.0421/+0.0321 for GTCRN (p232/p257). This positive small-sample result does not overturn the larger VoiceBank+DEMAND STOI miss, the subjective disagreement across blind checks, or the open PESQ and clean-speech preservation gates. It is also non-commercial-only evaluation data: WHAM's source page and Hugging Face mirror label the noise pack CC BY-NC 4.0. Do not use WHAM for shipped product claims or as the only release gate; get legal review and a separately licensed evaluation source for commercial qualification.

The six selected WAVs and per-clip CSV are in OS temporary storage at `%TEMP%\wham-test-realnoise-diagnostic-20260929`; no media or measurements were added to the repository. Dataset references: [WHAM official dataset and license](https://wham.whisper.ai/), [WHAM 48 kHz mirror and test split details](https://huggingface.co/datasets/0x3/wham), [selective test-row metadata](https://datasets-server.huggingface.co/rows?dataset=0x3%2Fwham&config=default&split=test&offset=0&length=1). The official EARS benchmark uses real WHAM noise but its protocol and split construction are distinct; see [EARS benchmark](https://github.com/sp-uhh/ears_benchmark).

### Gate disposition

- No PESQ result: the attempted Python binding did not build in this Windows environment because the required MSVC C++ toolchain is absent. PESQ implementation rights also need confirmation before selecting a scorer. The clean-speech regression gate therefore remains unverified; STOI is diagnostic evidence, not a substitute pass.
- No loudness-target result: the paired pilot measured integrated LUFS change, but there is not yet a selected output loudness target or complete processing/encoding path. Measure true peak and encoded-output clipping in a controlled run, then verify against the chosen target. Sample peaks below full scale do not prove zero clipping across the contract's broader media cases.
- Subjective evidence is limited and mixed: one reviewer preferred DPDFNet in all six VoiceBank+DEMAND trials, but preferred GTCRN in all six EARS trials. Neither is a multi-listener study or a release-level perceptual assessment. This disagreement reinforces that the objective STOI score alone cannot select a default. The 12 dB attenuation limit remains an experimental control, not an approved default.
- Broader paired real-noise evidence is still limited: the 100-clip VoiceBank+DEMAND sample covers only two speakers and misses the noisy STOI threshold despite passing median SI-SDR. The six-speaker EARS diagnostic clears median STOI on synthetic white/pink noise, and the 12-clip WHAM real-noise sample clears the exploratory median thresholds but covers only two speakers and six noise segments. Neither WHAM result nor the single-listener reviews establish broad product performance; the quality gate remains open.
- No app integration has been performed. The browser worker smoke used zero-valued tensors and does not pass actual-media quality, app cancellation/cleanup, cold-start offline loading, format, memory, or cross-platform gates.

Accordingly, DPDFNet remains an experimental candidate and must not yet be wired into the application as the production denoiser. The next meaningful gate is an adequately powered, rights-reviewed, multi-speaker evaluation with documented model-training non-overlap, combining a real-noise benchmark with an approved clean-speech regression measure (PESQ path or explicit contract change), integrated loudness/true peak, memory/RTF, duration, app-path output validation, and a multi-listener review. WHAM is useful for development diagnostics only under its current non-commercial license.
