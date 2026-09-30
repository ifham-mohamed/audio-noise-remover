/// <reference lib="webworker" />

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { audioStreamWasReported, containerWasRecognized, getAudioStreamCount, parseDecodableAudioStreams } from "@/features/intake/media-inspection-utils";
import { formatFromFileName, kindFromFormat } from "@/shared/contracts/media";

type ProbeRequest = { file: File };

self.onmessage = async (event: MessageEvent<ProbeRequest>) => {
  const file = event.data?.file;
  const format = file instanceof File ? formatFromFileName(file.name) : undefined;
  if (!file || !format || file.size === 0) {
    self.postMessage({ status: "error", code: "CORRUPT_MEDIA" });
    return;
  }

  const ffmpeg = new FFmpeg();
  const path = `/inspect.${format}`;
  let inputWritten = false;
  let log = "";
  const onLog = ({ message }: { message: string }) => { log += `${message}\n`; };
  ffmpeg.on("log", onLog);
  try {
    const core = new URL("/ffmpeg/ffmpeg-core.js", self.location.origin);
    await ffmpeg.load({ coreURL: core.href, wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", self.location.origin).href });
    await ffmpeg.writeFile(path, new Uint8Array(await file.arrayBuffer()));
    inputWritten = true;

    // Produce a bounded null output to force the demuxer to report its streams.
    // The optional mapping allows a valid video with no audio to report as such;
    // each candidate audio stream is then tested below for actual decodability.
    await ffmpeg.exec(["-hide_banner", "-i", path, "-map", "0:a:0?", "-t", "0.1", "-f", "null", "-"]);
    const initialLog = log;
    const count = getAudioStreamCount(initialLog);
    if (!count) {
      self.postMessage({ status: "error", code: containerWasRecognized(log, format) && !audioStreamWasReported(log) ? "NO_AUDIO_STREAM" : "CORRUPT_MEDIA" });
      return;
    }
    const decodableOrdinals = new Set<number>();
    for (let audioOrdinal = 0; audioOrdinal < count; audioOrdinal++) {
      const decodedPath = "/inspection-audio.wav";
      // The checked-in LGPL core intentionally includes PCM24, but not the
      // PCM16 encoder; use only codecs present in its verified configure set.
      const exitCode = await ffmpeg.exec(["-hide_banner", "-i", path, "-map", `0:a:${audioOrdinal}`, "-t", "0.1", "-vn", "-sn", "-dn", "-ar", "8000", "-ac", "1", "-c:a", "pcm_s24le", decodedPath]);
      if (exitCode === 0) {
        decodableOrdinals.add(audioOrdinal);
      }
      await ffmpeg.deleteFile(decodedPath).catch(() => undefined);
    }
    const decodableStreams = parseDecodableAudioStreams(initialLog, format, decodableOrdinals);
    if (!decodableStreams.length) {
      self.postMessage({ status: "error", code: "CORRUPT_MEDIA" });
      return;
    }
    self.postMessage({ status: "ready", durationSeconds: decodableStreams[0]!.durationSeconds, mediaKind: kindFromFormat(format), audioStreams: decodableStreams.map((probe) => probe.audioStream) });
  } catch {
    self.postMessage({ status: "error", code: "INSPECTION_UNAVAILABLE" });
  } finally {
    ffmpeg.off("log", onLog);
    if (ffmpeg.loaded && inputWritten) await ffmpeg.deleteFile(path).catch(() => undefined);
    ffmpeg.terminate();
  }
};

export {};
