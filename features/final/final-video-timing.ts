/** Timing evidence for the pinned local FFmpeg core. Logs contain packet metadata,
 * never packet bytes (-hex must not be used). Unsupported/absent evidence fails closed.
 * Only a continuous zero-origin video timeline and zero-origin audio (or at most
 * one AAC frame of negative preroll, preserved explicitly in Matroska) are accepted.
 */
export class UnsupportedVideoTiming extends Error {
  constructor(reason: string) { super(`Unsupported video timing: ${reason}.`); this.name = "UnsupportedVideoTiming"; }
}

const RATE = 48_000;
// Matroska packet timestamps and FFmpeg -dump are quantized to milliseconds.
const SAMPLE_TOLERANCE = 48;
const PACKET_TOLERANCE = 0.0011;
const MAX_PACKETS = 250_000;
export type VideoPacketTiming = { pts: number; dts: number; duration: number };
export type VideoTimeline = VideoPacketTiming[][];
export type PcmTimeline = { firstSample: number; sampleCount: number };

export function createVideoTimingProbe() {
  const videoIds: number[] = [];
  const packets = new Map<number, VideoPacketTiming[]>();
  let inputHeader = false;
  let streamId: number | undefined;
  let duration: number | undefined;
  let count = 0;
  let invalid = false;
  return {
    log(message: string) {
      for (const line of message.split(/\r?\n/)) {
        if (line.startsWith("Input #0,")) inputHeader = true;
        if (line.startsWith("Output #")) inputHeader = false;
        const declaration = inputHeader && line.match(/^\s*Stream #0:(\d+).*: Video:/);
        if (declaration) {
          const id = Number(declaration[1]);
          if (!videoIds.includes(id)) { videoIds.push(id); packets.set(id, []); }
        }
        const stream = line.match(/^stream #(\d+):$/);
        if (stream) { streamId = Number(stream[1]); duration = undefined; }
        const length = line.match(/^\s+duration=(\S+)$/);
        if (length) duration = Number(length[1]);
        const times = line.match(/^\s+dts=(\S+)\s+pts=(\S+)$/);
        if (times && streamId !== undefined && packets.has(streamId)) {
          const packet = { pts: Number(times[2]), dts: Number(times[1]), duration: duration ?? NaN };
          if (++count > MAX_PACKETS || !Object.values(packet).every(Number.isFinite) || packet.duration <= 0) invalid = true;
          else packets.get(streamId)!.push(packet);
        }
      }
    },
    finish(): VideoTimeline {
      const result = videoIds.map((id) => packets.get(id)!);
      if (invalid || !result.length || result.some((stream) => !stream.length)) throw new UnsupportedVideoTiming("video packet timestamps are missing, invalid, or exceed the bounded probe");
      return result;
    },
  };
}

export function createPcmTimingProbe() {
  let firstSample: number | undefined;
  let nextSample = 0;
  let sampleCount = 0;
  let count = 0;
  let invalid = false;
  return {
    log(message: string) {
      for (const line of message.split(/\r?\n/)) {
        if (!line.startsWith("muxer <- type:audio ")) continue;
        const match = line.match(/pkt_pts:(-?\d+) .*pkt_dts:(-?\d+) .*duration:(\d+) .*size:(\d+)$/);
        if (!match) { invalid = true; continue; }
        const pts = Number(match[1]), dts = Number(match[2]), duration = Number(match[3]), size = Number(match[4]);
        if (++count > MAX_PACKETS || ![pts, dts, duration, size].every(Number.isSafeInteger) || duration <= 0 || pts !== dts || size !== duration * 4) invalid = true;
        if (firstSample === undefined) firstSample = pts;
        else if (Math.abs(pts - nextSample) > SAMPLE_TOLERANCE) invalid = true;
        nextSample = pts + duration;
        sampleCount += duration;
      }
    },
    finish(decodedSampleCount: number): PcmTimeline {
      if (invalid || firstSample === undefined || sampleCount !== decodedSampleCount || Math.abs(nextSample - firstSample - sampleCount) > SAMPLE_TOLERANCE) throw new UnsupportedVideoTiming("decoded audio timestamps are missing or discontinuous");
      return { firstSample, sampleCount };
    },
  };
}

export function assertSupportedSourceTimeline(video: VideoTimeline, audio: PcmTimeline, muxer: string): number {
  const supportedAudio = audio.firstSample === 0 || muxer === "matroska" && audio.firstSample < 0 && audio.firstSample >= -1024 - SAMPLE_TOLERANCE;
  if (!video.length || video.some((packets) => !packets.length || Math.abs(packets[0].pts) > PACKET_TOLERANCE || packets.some((packet) => packet.pts < -PACKET_TOLERANCE)) || !supportedAudio) {
    throw new UnsupportedVideoTiming("delayed tracks and nonzero timeline origins are not supported; choose a source whose video and selected decoded audio start at zero");
  }
  // Preserve actual decoded PCM PTS, rather than guessing that negative packet
  // starts are encoder delay. In MP4/MOV the decoder has already applied edits.
  return audio.firstSample / RATE;
}

export function assertPreservedVideoTimeline(source: VideoTimeline, output: VideoTimeline) {
  if (source.length !== output.length || source.some((stream, index) => stream.length !== output[index].length || stream.some((packet, packetIndex) => {
    const other = output[index][packetIndex];
    return Math.abs(packet.pts - other.pts) > PACKET_TOLERANCE || Math.abs(packet.dts - other.dts) > PACKET_TOLERANCE || Math.abs(packet.duration - other.duration) > PACKET_TOLERANCE;
  }))) throw new UnsupportedVideoTiming("copied video presentation/decode timestamps changed during remux");
}

export function assertEncodedAudioTimeline(audio: PcmTimeline, muxer: string, sourceFirstSample = 0) {
  // The pinned native AAC encoder has 1024 samples of priming. MOV/MP4 edit
  // lists trim it; Matroska exposes it at negative PTS, before presentation zero.
  // Accept only these verified cases; do not interpret arbitrary delay as priming.
  const expectedFirstSample = muxer === "matroska" ? sourceFirstSample - 1024 : 0;
  if (Math.abs(audio.firstSample - expectedFirstSample) > SAMPLE_TOLERANCE) throw new UnsupportedVideoTiming("encoded AAC presentation origin does not match the verified priming/edit-list behavior");
}

export function buildTimedAudioDecodeArgs(input: string, audioOrdinal: number, output: string, maxDurationSeconds: number) {
  return ["-copyts", "-debug_ts", "-i", input, "-map", `0:a:${audioOrdinal}`, "-vn", "-sn", "-dn", "-ar", String(RATE), "-ac", "1", "-c:a", "pcm_f32le", "-t", String(maxDurationSeconds + 0.1), output];
}
