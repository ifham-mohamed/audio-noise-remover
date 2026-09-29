"""Regenerate the synthetic DPDFNet2 reference WAV after explicit model setup.

Mirrors the pinned publisher's onnx_model/infer_dpdfnet_onnx.py preprocessing,
stateful frame inference, 12 dB attenuation, and latency compensation. This is
evaluation-only; the output fixture contains a generated sine tone, no user media.
"""

from pathlib import Path
import hashlib
import numpy as np
import librosa
import onnxruntime as ort
import soundfile as sf

ROOT = Path(__file__).resolve().parents[3]
MODEL = ROOT / "models" / "dpdfnet2_48khz_hr.onnx"
INPUT = Path(__file__).with_name("tone.wav")
OUTPUT = Path(__file__).with_name("dpdfnet2-tone-reference.wav")
assert hashlib.sha256(MODEL.read_bytes()).hexdigest() == "7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b"

audio, sample_rate = sf.read(INPUT, dtype="float32")
if audio.ndim == 2:
    audio = np.mean(audio, axis=1, dtype=np.float32)
assert sample_rate == 48000

session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
metadata = session.get_modelmeta().custom_metadata_map
assert int(metadata["state_size"]) == 56436
assert int(metadata["erb_norm_state_size"]) == 481
assert int(metadata["spec_norm_state_size"]) == 96
state = np.zeros(56436, dtype=np.float32)
state[:481] = np.array([float(value) for value in metadata["erb_norm_init"].split(",")], dtype=np.float32)
state[481:577] = np.array([float(value) for value in metadata["spec_norm_init"].split(",")], dtype=np.float32)

win_len = 960
hop = 480
indices = np.arange(win_len)
window = np.sin(0.5 * np.pi * np.sin(np.pi * (indices + 0.5) / win_len) ** 2).astype(np.float32)
padded = np.pad(audio, (0, win_len), mode="constant")
noisy = librosa.stft(padded, n_fft=win_len, hop_length=hop, win_length=win_len, window=window, center=True, pad_mode="reflect").T
spec = np.stack([noisy.real, noisy.imag], axis=-1).astype(np.float32, copy=False)[None, ...]
frames = []
for frame in range(spec.shape[1]):
    result = session.run(["spec_e", "state_out"], {"spec": np.ascontiguousarray(spec[:, frame:frame + 1]), "state_in": state})
    frames.append(result[0])
    state = result[1]
enhanced = np.concatenate(frames, axis=1)
aligned = np.zeros_like(spec)
aligned[:, 4:] = spec[:, :-4]
alpha = 10 ** (-12 / 20)
enhanced = (alpha * aligned + (1 - alpha) * enhanced).astype(np.float32)
complex_spec = (enhanced[0, ..., 0] + 1j * enhanced[0, ..., 1]).T
waveform = librosa.istft(complex_spec, hop_length=hop, win_length=win_len, window=window, center=True)
waveform = np.concatenate([waveform[win_len * 2:], np.zeros(win_len * 2, dtype=np.float32)])
output = np.zeros(audio.shape[0], dtype=np.float32)
output[:min(len(waveform), len(output))] = waveform[:len(output)]
sf.write(OUTPUT, output, sample_rate, subtype="FLOAT")
print(f"Publisher-reference fixture: {OUTPUT.name}, {len(output)} samples, peak={np.max(np.abs(output)):.6f}")
