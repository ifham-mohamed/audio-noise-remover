# Generated browser-worker media fixtures

These short media files contain only synthetic sine tones (plus black frames for video). They contain no user recordings or third-party media. They are test data, not application outputs.

Files cover the supported WAV, MP3, FLAC, M4A, MP4, MOV, and MKV inputs. `two-audio-mkv.mkv` has two audio tracks: the first uses AC-3, which the reduced browser core intentionally does not include, and the second uses AAC, which it does. This makes the worker's selected-audio-track mapping observable: track 0 must fail as unsupported while selecting track 1 must decode successfully.

`two-usable-audio-mkv.mkv` contains two AAC audio tracks titled Main and Commentary. Both decode with the browser core and are used to verify source-order display, first-track defaulting, and alternate selection in the media-review UI.

The checked-in files were generated locally from FFmpeg lavfi `sine` and `color` sources. They are 48 kHz and approximately one second long. No generator binary is included or required when running tests.

`dpdfnet2-tone-reference.wav` is a float-WAV reference generated from the synthetic `tone.wav` by `publisher-dpdfnet-reference.py`. The script checks the locally installed publisher DPDFNet2 48 kHz ONNX SHA-256 (`7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b`) and mirrors its published centered STFT, stateful inference, 12 dB attenuation blend, ISTFT, and latency compensation. Regeneration requires `npm run model:setup` and the Python packages listed in the script. The reference is a test fixture, not a qualified speech-quality result or user recording.

Run `npm run test:e2e` to exercise these fixtures in Microsoft Edge through the real same-origin browser worker and bundled wasm core.
