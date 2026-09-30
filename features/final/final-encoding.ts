import type { FinalEncodingPlan } from "@/shared/contracts/final-output";

export function buildFinalEncodeArgs(plan: FinalEncodingPlan, sourcePath: string, enhancedPath: string, outputPath: string, verifiedAudioOffsetSeconds = 0): string[] {
  const input = plan.video ? ["-copyts", "-i", sourcePath, "-itsoffset", verifiedAudioOffsetSeconds.toFixed(9), "-i", enhancedPath, "-map", "0:v", "-map", "1:a:0", "-c:v", "copy", "-avoid_negative_ts", "disabled", "-map_metadata", "0", "-map_chapters", "0", "-metadata:s:a:0", "title=Enhanced speech", "-disposition:a:0", "default"] : ["-i", enhancedPath, "-map", "0:a:0", "-vn", "-sn", "-dn"];
  const codec = ["-ar", "48000", "-ac", "1", "-c:a", plan.codec];
  if (["aac", "libmp3lame"].includes(plan.codec)) codec.push("-b:a", "192k");
  if (plan.codec === "flac") codec.push("-sample_fmt", "s32", "-compression_level", "5");
  if (["mov", "mp4", "ipod"].includes(plan.muxer)) codec.push("-movflags", "+faststart");
  return [...input, ...codec, "-f", plan.muxer, outputPath];
}

export function buildVideoFingerprintArgs(inputPath: string, hashPath: string): string[] {
  return ["-copyts", "-dump", "-i", inputPath, "-map", "0:v", "-c:v", "copy", "-an", "-sn", "-dn", "-f", "streamhash", "-hash", "sha256", hashPath];
}

export function parseVideoFingerprints(bytes: Uint8Array): string[] {
  const lines = new TextDecoder().decode(bytes).trim().split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
  if (!lines.length || lines.some((line, index) => !new RegExp(`^${index},v,SHA256=[a-f0-9]{64}$`).test(line))) throw new Error("Video stream fingerprint validation failed.");
  return lines;
}

export function assertPreservedVideo(before: string[], after: string[]): void {
  if (before.length !== after.length || before.some((value, index) => value !== after[index])) throw new Error("Video stream preservation validation failed. No final output was published.");
}
