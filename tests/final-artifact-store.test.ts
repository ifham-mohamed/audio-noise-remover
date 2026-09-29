import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { FINAL_OUTPUT_MAX_BYTES, openFinalOutput, openFinalSource, removeFinalOutput, removeFinalSource, retainFinalOutput, saveFinalSource, validateFinalWav } from "@/features/final/final-artifact-store";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

function makeWav({ seconds = 1, channels = 2, sampleRate = 48_000, bits = 24, tag = 1, mimeType = "audio/wav" }: { seconds?: number; channels?: number; sampleRate?: number; bits?: number; tag?: number; mimeType?: string } = {}) {
  const align = channels * bits / 8;
  const dataLength = sampleRate * seconds * align;
  const bytes = new ArrayBuffer(44 + dataLength);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => [...value].forEach((ch, index) => view.setUint8(offset + index, ch.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, tag, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * align, true); view.setUint16(32, align, true); view.setUint16(34, bits, true); text(36, "data"); view.setUint32(40, dataLength, true);
  return new Blob([bytes], { type: mimeType });
}

const details = (blob: Blob, artifactId = "final-output-a") => ({ artifactId, fileName: "enhanced.wav", mimeType: "audio/wav" as const, sizeBytes: blob.size, durationSeconds: 1, validated: true as const });

describe("local final artifact store", () => {
  it("retains and reopens the original File by sourceRef after opening a new store connection", async () => {
    const file = new File(["original media"], "recording.wav", { type: "audio/wav", lastModified: 123 });
    await saveFinalSource("local:recording:14:123", file);
    const reopened = await openFinalSource("local:recording:14:123");
    expect(reopened).toBeInstanceOf(File);
    expect(reopened).toMatchObject({ name: "recording.wav", type: "audio/wav", lastModified: 123, size: file.size });
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(reopened!);
    });
    expect(text).toBe("original media");
  });

  it("retains a distinct validated 48 kHz PCM24 output and reopens its Blob by artifactId", async () => {
    const original = new File(["original"], "source.wav", { type: "audio/wav" });
    const blob = makeWav();
    await saveFinalSource("source-ref", original);
    const metadata = details(blob);
    const { artifactId, ...suppliedMetadata } = metadata;
    await expect(retainFinalOutput(artifactId, blob, suppliedMetadata)).resolves.toEqual(metadata);
    const opened = await openFinalOutput(metadata.artifactId);
    expect(opened?.blob).toBeInstanceOf(Blob);
    expect(opened?.blob).not.toBe(original);
    expect(opened).toMatchObject(metadata);
    expect(await openFinalSource("source-ref")).toMatchObject({ name: "source.wav" });
  });

  it("accepts mono and stereo PCM24 but rejects invalid WAV metadata and declared sizes", async () => {
    for (const channels of [1, 2]) {
      const blob = makeWav({ channels });
      await expect(validateFinalWav(blob, details(blob, `mono-stereo-${channels}`))).resolves.toMatchObject({ durationSeconds: 1 });
    }
    for (const blob of [makeWav({ sampleRate: 44_100 }), makeWav({ bits: 16 }), makeWav({ tag: 3 }), makeWav({ mimeType: "audio/mpeg" }), new Blob([new Uint8Array(50)], { type: "audio/wav" })]) {
      await expect(validateFinalWav(blob, details(blob))).rejects.toThrow();
    }
    const valid = makeWav();
    await expect(validateFinalWav(valid, { ...details(valid), sizeBytes: valid.size + 1 })).rejects.toThrow(/size/);
    await expect(validateFinalWav(valid, { ...details(valid), durationSeconds: 4 })).rejects.toThrow(/duration/);
  });

  it("enforces output-size and duration bounds before retention", async () => {
    const blob = makeWav();
    await expect(validateFinalWav(blob, { ...details(blob), sizeBytes: FINAL_OUTPUT_MAX_BYTES + 1 })).rejects.toThrow(/size/);
    await expect(validateFinalWav(blob, { ...details(blob), durationSeconds: 4 * 60 * 60 + 1 })).rejects.toThrow(/duration/);
  });

  it("removes only the requested source or final artifact", async () => {
    const source = new File(["source"], "source.wav", { type: "audio/wav" });
    const blob = makeWav();
    await saveFinalSource("source-ref", source);
    const { artifactId, ...metadata } = details(blob);
    await retainFinalOutput(artifactId, blob, metadata);
    await removeFinalSource("source-ref");
    expect(await openFinalSource("source-ref")).toBeUndefined();
    expect(await openFinalOutput("final-output-a")).toBeDefined();
    await removeFinalOutput("final-output-a");
    expect(await openFinalOutput("final-output-a")).toBeUndefined();
  });

  it("never overwrites a source snapshot or immutable final artifact with the same identifier", async () => {
    const firstSource = new File(["first"], "recording.wav", { type: "audio/wav" });
    const replacementSource = new File(["other"], "recording.wav", { type: "audio/wav" });
    await saveFinalSource("attempt-id", firstSource);
    await expect(saveFinalSource("attempt-id", replacementSource)).rejects.toThrow();
    const original = await openFinalSource("attempt-id");
    expect(original?.size).toBe(firstSource.size);

    const blob = makeWav();
    const { artifactId, ...metadata } = details(blob, "00000000-0000-4000-8000-000000000001");
    await retainFinalOutput(artifactId, blob, metadata);
    await expect(retainFinalOutput(artifactId, makeWav({ seconds: 2 }), { ...metadata, durationSeconds: 2 })).rejects.toThrow();
    expect((await openFinalOutput(artifactId))?.durationSeconds).toBe(1);
  });

  it("uses a database and object stores isolated from preview artifacts", async () => {
    const open = vi.spyOn(indexedDB, "open");
    const source = new File(["original"], "source.wav", { type: "audio/wav" });
    await saveFinalSource("source-ref", source);
    const blob = makeWav();
    const { artifactId, ...metadata } = details(blob);
    await retainFinalOutput(artifactId, blob, metadata);
    expect(open.mock.calls.map(([name]) => name)).toEqual(["ai-noice-removal-final-artifacts", "ai-noice-removal-final-artifacts"]);
    expect(open.mock.calls.some(([name]) => name === "ai-noice-removal-preview-artifacts")).toBe(false);
  });
});
