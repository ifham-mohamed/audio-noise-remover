import { describe, expect, it } from "vitest";
import { defaultOutputProfile, defaultProcessingProfile, defaultProcessingStages, normalizeProcessingProfile, outputProfileSchema, processingProfileSchema } from "@/shared/contracts/processing";
import { getProcessingProfileDeclaration, processingProfileRegistry, processingProfileDeclarationSchema, processingProfileRegistrySchema } from "@/shared/contracts/processing-profiles";

function futureSnapshot(profileId: "music" | "mixed-audio") {
  const declaration = getProcessingProfileDeclaration(profileId)!;
  return processingProfileSchema.parse({
    profileId,
    mediaRef: "local:future-profile",
    selectedAudioStreamId: "audio-0",
    stages: declaration.stages.map((stage) => ({ id: stage.id, enabled: true, parameters: Object.fromEntries(stage.parameters.map((parameter) => [parameter.id, parameter.defaultValue])) })),
    output: defaultOutputProfile("local:future-profile"),
  });
}

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

  it("rejects invalid parameter ranges and undeclared or malformed drafts", () => {
    expect(processingProfileSchema.safeParse({ mediaRef: "local:clip", stages: [{ id: "noise-removal", enabled: true, parameters: { intensity: 140 } }] }).success).toBe(false);
    expect(() => normalizeProcessingProfile({ mediaRef: "local:clip", stages: [{ id: "unknown", enabled: true, parameters: {} }] })).toThrow(/invalid or contains an undeclared stage/i);
  });

  it("registers typed speech, music, and mixed-audio declarations without granting future execution", () => {
    expect(processingProfileRegistry.map((profile) => profile.id)).toEqual(["speech", "music", "mixed-audio"]);
    expect(processingProfileRegistry[0]?.stages.map((stage) => stage.id)).toEqual(defaultProcessingStages.map((stage) => stage.id));
    for (const profile of processingProfileRegistry) {
      expect(profile.stages.every((stage) => stage.adapterId && stage.requiredCapabilities.length && stage.metrics.length)).toBe(true);
    }
    expect(processingProfileRegistry.filter((profile) => profile.id !== "speech").every((profile) => profile.execution.status === "unavailable" && profile.execution.reason)).toBe(true);
    expect(processingProfileDeclarationSchema.safeParse({ ...processingProfileRegistry[1], execution: { status: "unavailable", qualification: "unqualified", reason: "Not available." } }).success).toBe(true);
    expect(processingProfileDeclarationSchema.safeParse({ ...processingProfileRegistry[1], execution: { status: "available", qualification: "unqualified" } }).success).toBe(false);
    const firstStage = processingProfileRegistry[1]!.stages[0]!;
    expect(processingProfileDeclarationSchema.safeParse({ ...processingProfileRegistry[1], stages: [{ ...firstStage, parameters: [...firstStage.parameters, ...firstStage.parameters] }, ...processingProfileRegistry[1]!.stages.slice(1)] }).success).toBe(false);
    expect(processingProfileRegistrySchema.safeParse([...processingProfileRegistry, processingProfileRegistry[1]]).success).toBe(false);
  });

  it("round-trips registered future stages and parameters without converting them to speech", () => {
    for (const profileId of ["music", "mixed-audio"] as const) {
      const future = futureSnapshot(profileId);
      const normalized = normalizeProcessingProfile(future);
      expect(normalized.profileId).toBe(profileId);
      expect(normalized.stages.map((stage) => stage.id)).toEqual(getProcessingProfileDeclaration(profileId)!.stages.map((stage) => stage.id));
      expect(normalized.stages).toEqual(future.stages);
    }
  });

  it("rejects future snapshots with undeclared stages, parameters, or out-of-range values", () => {
    const future = futureSnapshot("music");
    expect(processingProfileSchema.safeParse({ ...future, stages: [{ ...future.stages[0]!, id: "not-registered" }, ...future.stages.slice(1)] }).success).toBe(false);
    expect(processingProfileSchema.safeParse({ ...future, stages: [{ ...future.stages[0]!, parameters: { intensity: 101 } }, ...future.stages.slice(1)] }).success).toBe(false);
  });

  it("defines media-aware output defaults and protects unsafe targets", () => {
    expect(defaultOutputProfile("local:voice", "audio").format).toBe("audio-wav");
    expect(defaultOutputProfile("local:meeting", "video", "mov").format).toBe("source-video");
    expect(defaultOutputProfile("local:meeting", "video", "mp4").format).toBe("mp4");
    const unsafe = { ...defaultOutputProfile("local:voice"), destination: { ...defaultOutputProfile("local:voice").destination, targetRef: "source" } };
    expect(outputProfileSchema.safeParse(unsafe).success).toBe(false);
  });
});
