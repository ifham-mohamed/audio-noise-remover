import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { listPreviewArtifactIds, openPreviewArtifact, pruneExpiredPreviewArtifacts, releasePreviewArtifactUrl, removePreviewArtifact, removePreviewArtifactPair, removePreviewArtifacts, retainPreviewArtifact, retainPreviewArtifactPair, validatePreviewArtifactBlob } from "@/features/preview/preview-artifact-store";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

function makePcmWav(options: { seconds?: number; sampleRate?: number; channels?: number; bitsPerSample?: number; mimeType?: string } = {}) {
  const seconds = options.seconds ?? 1;
  const sampleRate = options.sampleRate ?? 48_000;
  const channels = options.channels ?? 2;
  const bitsPerSample = options.bitsPerSample ?? 24;
  const dataBytes = sampleRate * seconds * channels * bitsPerSample / 8;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); writeText(8, "WAVE"); writeText(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true); view.setUint16(32, channels * bitsPerSample / 8, true); view.setUint16(34, bitsPerSample, true);
  writeText(36, "data"); view.setUint32(40, dataBytes, true);
  return new Blob([buffer], { type: options.mimeType ?? "audio/wav" });
}

const metadata = (blob: Blob, durationSeconds = 1) => ({ id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: blob.size, durationSeconds });

describe("preview artifact validation", () => {
  it("accepts a complete playable 48 kHz PCM WAV and returns validated metadata", async () => {
    const blob = makePcmWav();
    await expect(validatePreviewArtifactBlob(metadata(blob), blob)).resolves.toMatchObject({ mimeType: "audio/wav", durationSeconds: 1, sizeBytes: blob.size });
  });

  it("accepts FFmpeg's WAVE_FORMAT_EXTENSIBLE float WAV artifact", async () => {
    const source = makePcmWav({ channels: 1, bitsPerSample: 32 });
    const sourceBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Could not read test WAV"));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(source);
    });
    const original = new Uint8Array(sourceBuffer);
    const bytes = new Uint8Array(original.length + 24);
    bytes.set(original.subarray(0, 36));
    bytes.set(original.subarray(36), 60);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.length - 8, true);
    view.setUint32(16, 40, true);
    view.setUint16(20, 0xfffe, true);
    view.setUint16(36, 22, true);
    view.setUint16(38, 32, true);
    view.setUint32(44, 3, true);
    bytes.set([0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71], 48);
    const blob = new Blob([bytes], { type: "audio/wav" });
    await expect(validatePreviewArtifactBlob(metadata(blob), blob)).resolves.toMatchObject({ durationSeconds: 1 });
  });

  it("rejects malformed headers, unsupported sample rates, wrong metadata, and non-WAV media", async () => {
    const valid = makePcmWav();
    const brokenHeader = new Blob([new Uint8Array(100)], { type: "audio/wav" });
    const wrongRate = makePcmWav({ sampleRate: 44_100 });
    const mp3Blob = makePcmWav({ mimeType: "audio/mpeg" });
    await expect(validatePreviewArtifactBlob(metadata(brokenHeader), brokenHeader)).rejects.toThrow(/RIFF\/WAVE/);
    await expect(validatePreviewArtifactBlob(metadata(wrongRate), wrongRate)).rejects.toThrow(/48 kHz/);
    await expect(validatePreviewArtifactBlob(metadata(valid, 0.5), valid)).rejects.toThrow(/duration/);
    await expect(validatePreviewArtifactBlob(metadata(mp3Blob), mp3Blob)).rejects.toThrow(/WAV/);
  });

  it("scans WAV chunk headers beyond the first MiB without reading the padded chunk payload", async () => {
    const source = makePcmWav();
    const baseBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Could not read test WAV"));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(source);
    });
    const base = new Uint8Array(baseBuffer);
    const junkBytes = 1024 * 1024 + 2;
    const large = new Uint8Array(base.length + 8 + junkBytes);
    large.set(base.subarray(0, 12), 0);
    const writeText = (offset: number, value: string) => [...value].forEach((character, index) => { large[offset + index] = character.charCodeAt(0); });
    writeText(12, "JUNK");
    new DataView(large.buffer).setUint32(16, junkBytes, true);
    large.set(base.subarray(12), 20 + junkBytes);
    new DataView(large.buffer).setUint32(4, large.length - 8, true);
    const blob = new Blob([large], { type: "audio/wav" });
    await expect(validatePreviewArtifactBlob(metadata(blob), blob)).resolves.toMatchObject({ sizeBytes: blob.size, durationSeconds: 1 });
  });

  it("retains enhanced bytes locally, reopens a playable URL, and removes the local record", async () => {
    const blob = makePcmWav();
    const artifact = metadata(blob);
    const createObjectUrl = vi.fn((_blob: Blob) => "blob:local-enhanced-preview");
    const revokeObjectUrl = vi.fn();
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    try {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });

      await retainPreviewArtifact(artifact, blob);
      const opened = await openPreviewArtifact(artifact.id);
      expect(opened).toMatchObject({ ...artifact, url: "blob:local-enhanced-preview" });
      expect(createObjectUrl).toHaveBeenCalledOnce();
      expect(createObjectUrl.mock.calls[0][0]).toMatchObject({ size: blob.size, type: blob.type });
      releasePreviewArtifactUrl(opened!.url);
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:local-enhanced-preview");
      await removePreviewArtifact(artifact.id);
      await expect(openPreviewArtifact(artifact.id)).resolves.toBeUndefined();
    } finally {
      if (createDescriptor) Object.defineProperty(URL, "createObjectURL", createDescriptor);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (revokeDescriptor) Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("retains and reopens Before and After together, then releases both URLs", async () => {
    const beforeBlob = makePcmWav({ channels: 1, bitsPerSample: 32 });
    const afterBlob = makePcmWav({ channels: 1, bitsPerSample: 32 });
    const before = { ...metadata(beforeBlob), id: "00000000-0000-4000-8000-000000000003" };
    const after = { ...metadata(afterBlob), id: "00000000-0000-4000-8000-000000000004" };
    const createObjectUrl = vi.fn((blob: Blob) => `blob:paired-${blob.size}-${Math.random()}`);
    const revokeObjectUrl = vi.fn();
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    try {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
      await retainPreviewArtifactPair(before, beforeBlob, after, afterBlob);
      const [openedBefore, openedAfter] = await Promise.all([openPreviewArtifact(before.id), openPreviewArtifact(after.id)]);
      expect(openedBefore).toMatchObject({ ...before, url: expect.stringMatching(/^blob:paired-/) });
      expect(openedAfter).toMatchObject({ ...after, url: expect.stringMatching(/^blob:paired-/) });
      releasePreviewArtifactUrl(openedBefore!.url);
      releasePreviewArtifactUrl(openedAfter!.url);
      expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
      await removePreviewArtifactPair([before.id, after.id]);
      await expect(openPreviewArtifact(before.id)).resolves.toBeUndefined();
      await expect(openPreviewArtifact(after.id)).resolves.toBeUndefined();
    } finally {
      if (createDescriptor) Object.defineProperty(URL, "createObjectURL", createDescriptor);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (revokeDescriptor) Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("enumerates and removes every selected preview artifact without touching unselected data", async () => {
    const firstBlob = makePcmWav(); const secondBlob = makePcmWav();
    const first = { ...metadata(firstBlob), id: "00000000-0000-4000-8000-000000000011" };
    const second = { ...metadata(secondBlob), id: "00000000-0000-4000-8000-000000000012" };
    await retainPreviewArtifact(first, firstBlob); await retainPreviewArtifact(second, secondBlob);
    expect(await listPreviewArtifactIds()).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(await removePreviewArtifacts([first.id])).toMatchObject([{ id: first.id, removed: true }]);
    expect(await openPreviewArtifact(first.id)).toBeUndefined();
    expect(await openPreviewArtifact(second.id)).toBeDefined();
  });

  it("validates both members before retaining either side of a comparison", async () => {
    const beforeBlob = makePcmWav({ channels: 1, bitsPerSample: 32 });
    const invalidAfter = new Blob([new Uint8Array(64)], { type: "audio/wav" });
    const before = { ...metadata(beforeBlob), id: "00000000-0000-4000-8000-000000000003" };
    const after = { ...metadata(invalidAfter), id: "00000000-0000-4000-8000-000000000004" };
    await expect(retainPreviewArtifactPair(before, beforeBlob, after, invalidAfter)).rejects.toThrow(/RIFF\/WAVE/);
    await expect(openPreviewArtifact(before.id)).resolves.toBeUndefined();
  });

  it("prunes expired preview artifacts according to the seven-day local retention window", async () => {
    const blob = makePcmWav();
    const artifact = metadata(blob);
    await retainPreviewArtifact(artifact, blob);
    await pruneExpiredPreviewArtifacts(Date.now() + 7 * 24 * 60 * 60 * 1000 + 1);
    await expect(openPreviewArtifact(artifact.id)).resolves.toBeUndefined();
  });

  it("removes an expired artifact when that artifact is opened", async () => {
    const blob = makePcmWav();
    const artifact = metadata(blob);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now");
    try {
      clock.mockReturnValue(now);
      await retainPreviewArtifact(artifact, blob);
      clock.mockReturnValue(now + 7 * 24 * 60 * 60 * 1000 + 1);
      await expect(openPreviewArtifact(artifact.id)).resolves.toBeUndefined();
      clock.mockReturnValue(now);
      await expect(openPreviewArtifact(artifact.id)).resolves.toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });
});
