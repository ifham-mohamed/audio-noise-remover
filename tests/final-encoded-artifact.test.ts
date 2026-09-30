import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openFinalOutput, retainFinalOutput } from "@/features/final/final-artifact-store";
import { encodedOutputDigest, validateEncodedOutput } from "@/features/final/final-output-validation";
import type { FinalOutputMime } from "@/shared/contracts/final-output";

beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("crypto", webcrypto); });
const formats: [string, FinalOutputMime][] = [["flac", "audio/flac"], ["mp3", "audio/mpeg"], ["m4a", "audio/mp4"], ["mp4", "video/mp4"], ["mov", "video/quicktime"], ["mkv", "video/x-matroska"]];
describe("encoded output retention integrity", () => {
  for (const [extension, mimeType] of formats) it(`retains and reopens the validated ${extension} bytes and rejects changed payloads`, async () => {
    const bytes = Uint8Array.from(readFileSync(`tests/fixtures/preview/tone.${extension}`));
    const blob = new Blob([bytes], { type: mimeType });
    const metadata = { fileName: `enhanced.${extension}`, mimeType, durationSeconds: 1, sha256: await encodedOutputDigest(blob) };
    await retainFinalOutput(`artifact-${extension}`, blob, metadata);
    const opened = await openFinalOutput(`artifact-${extension}`);
    expect(opened).toMatchObject({ ...metadata, sizeBytes: blob.size, validated: true });
    bytes[bytes.length - 1] ^= 1;
    const changed = new Blob([bytes], { type: mimeType });
    await expect(validateEncodedOutput(changed, { ...metadata, artifactId: "changed", sizeBytes: changed.size, validated: true })).rejects.toThrow(/matches the bytes/);
    await expect(retainFinalOutput("missing-evidence", blob, { ...metadata, sha256: undefined })).rejects.toThrow(/matches the bytes/);
  });
  it("rejects invalid container signatures even with a matching checksum", async () => {
    const blob = new Blob([new Uint8Array(64)], { type: "audio/flac" });
    await expect(validateEncodedOutput(blob, { artifactId: "invalid", fileName: "output.flac", mimeType: "audio/flac", sizeBytes: blob.size, durationSeconds: 1, validated: true, sha256: await encodedOutputDigest(blob) })).rejects.toThrow(/container/);
  });
  it("rejects a filename using a different format or a source-path traversal", async () => {
    const blob = new Blob([Uint8Array.from(readFileSync("tests/fixtures/preview/tone.flac"))], { type: "audio/flac" });
    const metadata = { fileName: "../source.flac", mimeType: "audio/flac", durationSeconds: 1, sha256: await encodedOutputDigest(blob) };
    await expect(retainFinalOutput("unsafe", blob, metadata)).rejects.toThrow(/name/);
    await expect(retainFinalOutput("mismatch", blob, { ...metadata, fileName: "enhanced.mp3" })).rejects.toThrow(/name/);
  });
});
