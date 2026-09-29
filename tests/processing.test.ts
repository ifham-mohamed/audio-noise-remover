import { describe, expect, it } from "vitest";
import { defaultOutputProfile, defaultProcessingProfile, defaultProcessingStages, normalizeProcessingProfile, outputProfileSchema, processingProfileSchema } from "@/shared/contracts/processing";

describe("processing profile contract", () => {
  it("creates explicit speech defaults in canonical order", () => {
    const profile = defaultProcessingProfile("local:interview", "audio-0");
    expect(profile.stages.map((stage) => stage.id)).toEqual(["noise-removal", "voice-clarity", "loudness-normalization", "echo-reverb-reduction"]);
    expect(profile.stages.filter((stage) => stage.enabled).map((stage) => stage.id)).toEqual(["noise-removal", "voice-clarity"]);
    expect(profile.selectedAudioStreamId).toBe("audio-0");
  });

  it("omits disabled stages from the normalized enabled pipeline while preserving order", () => {
    const profile = defaultProcessingProfile("local:interview");
    const normalized = normalizeProcessingProfile({ ...profile, stages: [{ ...defaultProcessingStages[2], enabled: true }, { ...defaultProcessingStages[0], enabled: false }, { ...defaultProcessingStages[1], enabled: false }] });
    expect(normalized.stages.map((stage) => stage.id)).toEqual(["noise-removal", "voice-clarity", "loudness-normalization", "echo-reverb-reduction"]);
    expect(normalized.stages.filter((stage) => stage.enabled).map((stage) => stage.id)).toEqual(["loudness-normalization"]);
  });

  it("rejects invalid parameter ranges and falls back safely for stale drafts", () => {
    expect(processingProfileSchema.safeParse({ mediaRef: "local:clip", stages: [{ id: "noise-removal", enabled: true, parameters: { intensity: 140 } }] }).success).toBe(false);
    expect(normalizeProcessingProfile({ mediaRef: "local:clip", stages: [{ id: "unknown", enabled: true, parameters: {} }] }).mediaRef).toBe("local:clip");
  });

  it("defines media-aware output defaults and protects unsafe targets", () => {
    expect(defaultOutputProfile("local:voice", "audio").format).toBe("audio-wav");
    expect(defaultOutputProfile("local:meeting", "video", "mov").format).toBe("source-video");
    expect(defaultOutputProfile("local:meeting", "video", "mp4").format).toBe("mp4");
    const unsafe = { ...defaultOutputProfile("local:voice"), destination: { ...defaultOutputProfile("local:voice").destination, targetRef: "source" } };
    expect(outputProfileSchema.safeParse(unsafe).success).toBe(false);
  });
});
