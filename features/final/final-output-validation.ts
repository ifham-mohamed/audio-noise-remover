import { finalOutputDigestSchema, finalOutputMimeSchema, isSafeFinalOutputName, type FinalOutputMime } from "@/shared/contracts/final-output";

const extensions: Record<FinalOutputMime, string> = { "audio/wav": "wav", "audio/flac": "flac", "audio/mpeg": "mp3", "audio/mp4": "m4a", "video/mp4": "mp4", "video/quicktime": "mov", "video/x-matroska": "mkv" };
export type EncodedOutputMetadata = { artifactId: string; fileName: string; mimeType: FinalOutputMime; sizeBytes: number; durationSeconds: number; validated: true; sha256?: string };

export async function encodedOutputDigest(blob: Blob): Promise<string> {
  const bytes = typeof blob.arrayBuffer === "function" ? await blob.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Output could not be read.")); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob);
  });
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Decoder validation happens in the media worker; retention binds those bytes to its digest. */
export async function validateEncodedOutput(blob: Blob, metadata: EncodedOutputMetadata): Promise<EncodedOutputMetadata> {
  if (!finalOutputMimeSchema.safeParse(metadata.mimeType).success || blob.type !== metadata.mimeType || metadata.validated !== true) throw new Error("Final output type is invalid.");
  if (!metadata.artifactId?.trim() || !isSafeFinalOutputName(metadata.fileName, extensions[metadata.mimeType])) throw new Error("Final output name or identifier is invalid.");
  if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes !== blob.size || blob.size < 16 || blob.size > 512 * 1024 * 1024) throw new Error("Final output size is invalid.");
  if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0 || metadata.durationSeconds > 4 * 60 * 60) throw new Error("Final output duration is invalid.");
  if (!finalOutputDigestSchema.safeParse(metadata.sha256).success || await encodedOutputDigest(blob) !== metadata.sha256) throw new Error("Final output no longer matches the bytes validated by the media worker.");
  const headBlob = blob.slice(0, Math.min(blob.size, 64));
  const head = new Uint8Array(typeof headBlob.arrayBuffer === "function" ? await headBlob.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Output header unavailable.")); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(headBlob);
  }));
  const text = (offset: number, length: number) => String.fromCharCode(...head.subarray(offset, offset + length));
  let matches = false;
  if (metadata.mimeType === "audio/flac") matches = text(0, 4) === "fLaC";
  else if (metadata.mimeType === "audio/mpeg") matches = text(0, 3) === "ID3" || head[0] === 0xff && (head[1]! & 0xe0) === 0xe0;
  else if (metadata.mimeType === "video/x-matroska") matches = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  else if (["audio/mp4", "video/mp4", "video/quicktime"].includes(metadata.mimeType)) matches = text(4, 4) === "ftyp" && new DataView(head.buffer).getUint32(0) >= 16;
  if (!matches) throw new Error("Final output container does not match its declared format.");
  return { ...metadata };
}
