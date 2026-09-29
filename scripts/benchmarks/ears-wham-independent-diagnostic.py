#!/usr/bin/env python3
"""Private EARS test-speech + WHAM test-noise DPDFNet2 diagnostic.

This is a development diagnostic, not a production qualification or a proof
of training-data non-overlap. The DPDFNet paper names DNS4/MLS speech and
MUSAN/FSD50K noise for training; it does not name EARS or WHAM. The local EARS
mirror contains lossy Opus audio. EARS and WHAM are CC BY-NC 4.0; retain their
notices and attribution, and do not redistribute source or derived audio.

Required packages: numpy, pyarrow, scipy, soundfile, pystoi, sherpa-onnx.
The script reads local data, verifies the pinned publisher ONNX hash, and writes
only a per-pair CSV and provenance/summary JSON into a new OS-temp directory.
It never writes media or results into the repository.

Example:
  python scripts/benchmarks/ears-wham-independent-diagnostic.py \
    --ears-dir "$TEMP/ears-test-diagnostic-20260929" \
    --wham-dir "$TEMP/wham-test-realnoise-diagnostic-20260929" \
    --model "$TEMP/ai-noice-bakeoff-2a5773b566864229a997d5cb1fe151e9/dpdfnet2_48khz_hr-c7ac7b2.onnx"
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import statistics
import sys
import tempfile
import time

import numpy as np
import pyarrow
import pyarrow.parquet as pq
import scipy
from scipy.signal import resample_poly
import sherpa_onnx
import soundfile as sf
from pystoi import stoi


SEED = 20260929
SAMPLE_RATE = 48_000
STOI_RATE = 16_000
WINDOW_SECONDS = 8
WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS
SPEAKERS = tuple(f"p{i}" for i in range(102, 108))
SNRS_DB = (0, 5, 10)
EXPECTED_MODEL_SHA256 = "7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b"
MODEL_REVISION = "c7ac7b249ff5e17fa606794dc4f68ed9a544834f"
MODEL_URL = f"https://huggingface.co/Ceva-IP/DPDFNet/tree/{MODEL_REVISION}"
LICENSES = {
    "EARS": {
        "license": "CC BY-NC 4.0",
        "source": "https://github.com/facebookresearch/ears_dataset",
        "local_representation": "philgzl/ears test Parquet, Opus-derived 48 kHz audio",
    },
    "WHAM": {
        "license": "CC BY-NC 4.0",
        "source": "https://wham.whisper.ai/",
        "local_representation": "seven 48 kHz test-split real-noise WAV files",
    },
    "DPDFNet2": {"license": "Apache-2.0 (publisher model card)", "source": MODEL_URL},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_int(*parts: object) -> int:
    message = "|".join(str(part) for part in (SEED, *parts)).encode("utf-8")
    return int.from_bytes(hashlib.sha256(message).digest()[:8], "big")


def rms(signal: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(signal, dtype=np.float64))))


def si_sdr(reference: np.ndarray, estimate: np.ndarray) -> float:
    reference = np.asarray(reference, dtype=np.float64)
    estimate = np.asarray(estimate, dtype=np.float64)
    reference = reference - np.mean(reference)
    estimate = estimate - np.mean(estimate)
    reference_energy = float(np.dot(reference, reference))
    if reference_energy < 1e-12:
        raise ValueError("SI-SDR reference is silent")
    target = np.dot(estimate, reference) / reference_energy * reference
    residual = estimate - target
    return 10.0 * math.log10((float(np.dot(target, target)) + 1e-12) / (float(np.dot(residual, residual)) + 1e-12))


def aligned(reference: np.ndarray, estimate: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    length = min(len(reference), len(estimate))
    if length < SAMPLE_RATE:
        raise ValueError("model returned less than one second")
    return reference[:length], estimate[:length]


def stoi_48k(reference: np.ndarray, estimate: np.ndarray) -> float:
    reference, estimate = aligned(reference, estimate)
    # Common 16 kHz polyphase resampling; avoids different STOI behavior at 48 kHz.
    return float(stoi(resample_poly(reference, 1, 3), resample_poly(estimate, 1, 3), STOI_RATE, extended=False))


def load_ears(parquets: list[Path], quota: dict[str, int]) -> list[tuple[str, str, np.ndarray]]:
    ranked: dict[str, list[tuple[int, str, bytes]]] = {speaker: [] for speaker in SPEAKERS}
    seen: set[str] = set()
    for parquet in parquets:
        for batch in pq.ParquetFile(parquet).iter_batches(batch_size=32, columns=["name", "audio"]):
            records = batch.to_pydict()
            for name, audio in zip(records["name"], records["audio"], strict=True):
                if not isinstance(name, str) or not isinstance(audio, bytes):
                    raise ValueError(f"malformed EARS row in {parquet.name}")
                speaker = name.split("/", 1)[0]
                if speaker not in ranked:
                    continue
                if name in seen:
                    raise ValueError(f"duplicate EARS clip: {name}")
                seen.add(name)
                ranked[speaker].append((stable_int("speech-rank", name), name, audio))

    selected: dict[str, list[tuple[str, np.ndarray]]] = {speaker: [] for speaker in SPEAKERS}
    for speaker in SPEAKERS:
        if quota[speaker] == 0:
            continue
        for _, name, audio in sorted(ranked[speaker], key=lambda item: (item[0], item[1])):
            signal, rate = sf.read(io.BytesIO(audio), dtype="float32", always_2d=False)
            if rate != SAMPLE_RATE or signal.ndim != 1 or len(signal) < WINDOW_SAMPLES:
                continue
            max_start = len(signal) - WINDOW_SAMPLES
            start = stable_int("speech-offset", name) % (max_start + 1)
            excerpt = np.ascontiguousarray(signal[start : start + WINDOW_SAMPLES], dtype=np.float32)
            if not np.isfinite(excerpt).all() or rms(excerpt) < 10 ** (-45 / 20):
                continue
            selected[speaker].append((name, excerpt))
            if len(selected[speaker]) == quota[speaker]:
                break
        if len(selected[speaker]) != quota[speaker]:
            raise ValueError(f"{speaker}: found {len(selected[speaker])} eligible clips, need {quota[speaker]}")

    # Round-robin order ensures each prefix of the 100-pair sequence covers speakers.
    return [
        (speaker, *selected[speaker][index])
        for index in range(max(quota.values()))
        for speaker in SPEAKERS
        if index < len(selected[speaker])
    ]


def load_wham(paths: list[Path]) -> list[tuple[str, np.ndarray]]:
    noises: list[tuple[str, np.ndarray]] = []
    for path in paths:
        signal, rate = sf.read(path, dtype="float32", always_2d=True)
        if rate != SAMPLE_RATE or len(signal) < WINDOW_SAMPLES:
            raise ValueError(f"WHAM file has wrong sample rate or duration: {path}")
        # A fixed arithmetic stereo downmix, with no content-dependent channel choice.
        mono = np.ascontiguousarray(signal.mean(axis=1), dtype=np.float32)
        if not np.isfinite(mono).all() or rms(mono) < 1e-5:
            raise ValueError(f"WHAM file is invalid or silent: {path}")
        noises.append((path.name, mono))
    return noises


def mixture(clean: np.ndarray, noise: np.ndarray, snr_db: int, pair_index: int) -> tuple[np.ndarray, np.ndarray, int, float]:
    max_start = len(noise) - WINDOW_SAMPLES
    offset = stable_int("noise-offset", pair_index) % (max_start + 1)
    segment = noise[offset : offset + WINDOW_SAMPLES].copy()
    segment -= float(np.mean(segment))
    speech_rms, noise_rms = rms(clean), rms(segment)
    if speech_rms < 1e-5 or noise_rms < 1e-5:
        raise ValueError("speech or noise excerpt is silent")
    segment *= speech_rms / (noise_rms * 10 ** (snr_db / 20))
    mixed = clean + segment
    peak = float(np.max(np.abs(mixed)))
    gain = min(1.0, 0.98 / peak) if peak else 1.0
    # Apply the same level adjustment to the clean reference and noisy input.
    return np.asarray(clean * gain, dtype=np.float32), np.asarray(mixed * gain, dtype=np.float32), offset, gain


def infer(denoiser: sherpa_onnx.OfflineSpeechDenoiser, signal: np.ndarray) -> tuple[np.ndarray, float]:
    started = time.perf_counter()
    result = denoiser.run(signal, SAMPLE_RATE)
    elapsed = time.perf_counter() - started
    if result.sample_rate != SAMPLE_RATE:
        raise ValueError(f"unexpected model sample rate: {result.sample_rate}")
    output = np.asarray(result.samples, dtype=np.float32)
    if output.ndim != 1 or not np.isfinite(output).all() or len(output) < SAMPLE_RATE:
        raise ValueError("model returned invalid audio")
    return output, elapsed / WINDOW_SECONDS


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    base = Path(tempfile.gettempdir())
    parser.add_argument("--ears-dir", type=Path, default=base / "ears-test-diagnostic-20260929")
    parser.add_argument("--wham-dir", type=Path, default=base / "wham-test-realnoise-diagnostic-20260929")
    parser.add_argument("--model", type=Path, default=base / "ai-noice-bakeoff-2a5773b566864229a997d5cb1fe151e9" / "dpdfnet2_48khz_hr-c7ac7b2.onnx")
    parser.add_argument("--limit", type=int, default=100, help="pair count (default: 100; use 1 for a smoke test)")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be 1..100")

    parquets = sorted(args.ears_dir.glob("test-*.parquet"))
    wham_paths = sorted(args.wham_dir.glob("*.wav"))
    if len(parquets) != 4 or len(wham_paths) != 7:
        raise ValueError(f"expected four EARS Parquets and seven WHAM WAVs; found {len(parquets)} and {len(wham_paths)}")
    if not args.model.is_file() or sha256(args.model) != EXPECTED_MODEL_SHA256:
        raise ValueError(f"pinned model is absent or hash differs from {EXPECTED_MODEL_SHA256}: {args.model}")

    quota = {speaker: args.limit // len(SPEAKERS) + (index < args.limit % len(SPEAKERS)) for index, speaker in enumerate(SPEAKERS)}
    if args.limit == 100:
        assert sorted(quota.values()) == [16, 16, 17, 17, 17, 17]
    speech = load_ears(parquets, quota)
    noises = load_wham(wham_paths)
    model_config = sherpa_onnx.OfflineSpeechDenoiserModelConfig(
        dpdfnet=sherpa_onnx.OfflineSpeechDenoiserDpdfNetModelConfig(model=str(args.model), attenuation_limit_db=12.0),
        num_threads=1,
        provider="cpu",
    )
    denoiser = sherpa_onnx.OfflineSpeechDenoiser(sherpa_onnx.OfflineSpeechDenoiserConfig(model=model_config))
    if denoiser.sample_rate != SAMPLE_RATE:
        raise ValueError(f"model expects {denoiser.sample_rate} Hz, not {SAMPLE_RATE} Hz")

    output_dir = Path(tempfile.mkdtemp(prefix="ears-wham-independent-diagnostic-"))
    csv_path = output_dir / "per-clip.csv"
    fields = (
        "pair_index", "speaker", "speech_name", "noise_name", "noise_offset_samples", "snr_db", "mixture_gain",
        "stoi_noisy", "stoi_enhanced", "stoi_gain", "sisdr_noisy_db", "sisdr_enhanced_db", "sisdr_gain_db",
        "clean_stoi", "clean_stoi_delta", "clean_sisdr_db", "rtf_noisy", "rtf_clean", "input_peak", "output_peak",
        "clean_output_peak", "noisy_output_delta_ms", "clean_output_delta_ms",
    )
    rows: list[dict[str, object]] = []
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for index, (speaker, name, clean) in enumerate(speech):
            noise_name, noise = noises[index % len(noises)]
            # Rotate by both speaker slot and round, so every speaker sees all SNRs.
            snr_db = SNRS_DB[(index // len(SPEAKERS) + index % len(SPEAKERS)) % len(SNRS_DB)]
            reference, noisy, offset, gain = mixture(clean, noise, snr_db, index)
            enhanced, rtf_noisy = infer(denoiser, noisy)
            preserved, rtf_clean = infer(denoiser, reference)
            ref_noisy, result_noisy = aligned(reference, noisy)
            ref_enhanced, result_enhanced = aligned(reference, enhanced)
            ref_clean, result_clean = aligned(reference, preserved)
            stoi_noisy = stoi_48k(ref_noisy, result_noisy)
            stoi_enhanced = stoi_48k(ref_enhanced, result_enhanced)
            sisdr_noisy = si_sdr(ref_noisy, result_noisy)
            sisdr_enhanced = si_sdr(ref_enhanced, result_enhanced)
            clean_stoi = stoi_48k(ref_clean, result_clean)
            row = {
                "pair_index": index, "speaker": speaker, "speech_name": name, "noise_name": noise_name,
                "noise_offset_samples": offset, "snr_db": snr_db, "mixture_gain": gain,
                "stoi_noisy": stoi_noisy, "stoi_enhanced": stoi_enhanced, "stoi_gain": stoi_enhanced - stoi_noisy,
                "sisdr_noisy_db": sisdr_noisy, "sisdr_enhanced_db": sisdr_enhanced,
                "sisdr_gain_db": sisdr_enhanced - sisdr_noisy,
                "clean_stoi": clean_stoi, "clean_stoi_delta": clean_stoi - 1.0,
                "clean_sisdr_db": si_sdr(ref_clean, result_clean),
                "rtf_noisy": rtf_noisy, "rtf_clean": rtf_clean,
                "input_peak": float(np.max(np.abs(noisy))), "output_peak": float(np.max(np.abs(enhanced))),
                "clean_output_peak": float(np.max(np.abs(preserved))),
                "noisy_output_delta_ms": (len(enhanced) - len(noisy)) * 1000 / SAMPLE_RATE,
                "clean_output_delta_ms": (len(preserved) - len(reference)) * 1000 / SAMPLE_RATE,
            }
            writer.writerow(row)
            stream.flush()
            rows.append(row)
            if (index + 1) % 10 == 0 or index + 1 == args.limit:
                print(f"Scored {index + 1}/{args.limit} pairs", flush=True)

    metric_names = ("stoi_gain", "sisdr_gain_db", "clean_stoi", "clean_stoi_delta", "clean_sisdr_db", "rtf_noisy")
    summary = {
        "label": "private local development diagnostic; not a production qualification or proven independent holdout",
        "pairs": len(rows), "speakers": {speaker: sum(row["speaker"] == speaker for row in rows) for speaker in SPEAKERS},
        "noise_counts": {name: sum(row["noise_name"] == name for row in rows) for name, _ in noises},
        "snr_counts": {str(snr): sum(row["snr_db"] == snr for row in rows) for snr in SNRS_DB},
        "medians": {name: statistics.median(float(row[name]) for row in rows) for name in metric_names},
        "stoi_regressions": sum(float(row["stoi_gain"]) < 0 for row in rows),
        "output_sample_clips": sum(max(float(row["output_peak"]), float(row["clean_output_peak"])) >= 1 for row in rows),
        "independence_note": "DPDFNet paper names DNS4/MLS speech and MUSAN/FSD50K noise, not EARS/WHAM. Exact source-level and speaker-level training non-overlap is unproven.",
        "limitations": [
            "EARS mirror audio was converted to lossy Opus; seven WHAM recordings are reused across pairs.",
            "The EARS and WHAM licenses restrict commercial use; this run is private/local diagnostic only.",
            "No PESQ, blinded listening, true peak, output encoding, loudness target, or app-path test is included.",
            "STOI and SI-SDR thresholds alone cannot qualify this model or profile for production.",
        ],
        "protocol": {"seed": SEED, "speech_window_seconds": WINDOW_SECONDS, "sample_rate": SAMPLE_RATE, "stoi_sample_rate": STOI_RATE,
                     "snr_db": SNRS_DB, "snr_assignment": "(round_index + speaker_slot) modulo 3", "model_attenuation_limit_db": 12, "selection": "SHA-256 rank within each speaker; deterministic 8-second offset; minimum -45 dBFS RMS", "noise_assignment": "sorted seven files cycled in pair order; SHA-256 offset"},
        "licenses": LICENSES,
        "provenance": {
            "model_revision": MODEL_REVISION, "model_sha256": EXPECTED_MODEL_SHA256,
            "inputs": {str(path): sha256(path) for path in [*parquets, *wham_paths]},
            "python": sys.version.split()[0], "numpy": np.__version__, "pyarrow": pyarrow.__version__,
            "scipy": scipy.__version__, "soundfile": sf.__version__, "sherpa_onnx": sherpa_onnx.__version__,
        },
    }
    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"per_clip_csv": str(csv_path), "summary_json": str(summary_path), "medians": summary["medians"]}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"Diagnostic blocked: {error}", file=sys.stderr)
        raise SystemExit(2) from error
