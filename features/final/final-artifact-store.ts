const databaseName = "ai-noice-removal-final-artifacts";
const databaseVersion = 1;
const sourceStoreName = "sources";
const outputStoreName = "outputs";
export const FINAL_SOURCE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const FINAL_OUTPUT_MAX_BYTES = 512 * 1024 * 1024;
export const FINAL_OUTPUT_MAX_DURATION_SECONDS = 4 * 60 * 60;

export type FinalOutputMetadata = {
  artifactId: string;
  fileName: string;
  mimeType: "audio/wav";
  sizeBytes: number;
  durationSeconds: number;
  validated: true;
};

type StoredSource = { sourceRef: string; name: string; type: string; lastModified: number; bytes: ArrayBuffer; storedAt: number };
type StoredOutput = FinalOutputMetadata & { bytes: ArrayBuffer; storedAt: number };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local final-artifact storage request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local final-artifact storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local final-artifact storage was interrupted."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Local final-artifact storage is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(sourceStoreName)) db.createObjectStore(sourceStoreName, { keyPath: "sourceRef" });
      if (!db.objectStoreNames.contains(outputStoreName)) db.createObjectStore(outputStoreName, { keyPath: "artifactId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local final-artifact storage could not be opened."));
    request.onblocked = () => reject(new Error("Local final-artifact storage is busy in another tab."));
  });
}

function assertKey(key: string, label: string): void {
  if (typeof key !== "string" || !key.trim() || key.length > 512) throw new Error(`${label} must be a non-empty local identifier of at most 512 characters.`);
}

function isBlob(value: unknown): value is Blob {
  return !!value && typeof value === "object" && typeof (value as Blob).size === "number" && typeof (value as Blob).slice === "function" && typeof (value as Blob).type === "string";
}

async function readExact(blob: Blob, start: number, length: number): Promise<DataView> {
  const part = blob.slice(start, start + length);
  const bytes = typeof part.arrayBuffer === "function" ? await part.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Final WAV bytes could not be read locally."));
    reader.onerror = () => reject(reader.error ?? new Error("Final WAV bytes could not be read locally."));
    reader.readAsArrayBuffer(part);
  });
  if (bytes.byteLength !== length) throw new Error("The final WAV contains a truncated header or chunk.");
  return new DataView(bytes);
}

async function readFourCC(blob: Blob, start: number): Promise<string> {
  const view = await readExact(blob, start, 4);
  return String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
}

/** Inspect container metadata only; audio payload bytes are never decoded or sent elsewhere. */
export async function validateFinalWav(blob: Blob, metadata: FinalOutputMetadata): Promise<FinalOutputMetadata> {
  assertKey(metadata.artifactId, "Artifact ID");
  assertKey(metadata.fileName, "Output file name");
  if (metadata.fileName !== metadata.fileName.trim() || !metadata.fileName.toLowerCase().endsWith(".wav") || /[\\/<>:\"|?*\u0000-\u001f]/.test(metadata.fileName) || /[. ]$/.test(metadata.fileName)) throw new Error("Final WAV file name is unsafe or does not use the WAV extension.");
  if (metadata.validated !== true || metadata.mimeType !== "audio/wav" || blob.type.toLowerCase() !== "audio/wav") throw new Error("Final output must be identified as validated WAV audio.");
  if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes !== blob.size || blob.size < 44 || blob.size > FINAL_OUTPUT_MAX_BYTES) throw new Error("Final WAV size is invalid, mismatched, or exceeds the local storage limit.");
  if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0 || metadata.durationSeconds > FINAL_OUTPUT_MAX_DURATION_SECONDS) throw new Error("Final WAV duration is outside the supported local limit.");
  if (await readFourCC(blob, 0) !== "RIFF" || await readFourCC(blob, 8) !== "WAVE") throw new Error("Final output is not a RIFF/WAVE file.");
  const riffSize = (await readExact(blob, 4, 4)).getUint32(0, true);
  const riffEnd = riffSize + 8;
  if (riffEnd !== blob.size || riffEnd < 44) throw new Error("Final WAV declares an invalid or incomplete file size.");

  let format: { tag: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bits: number } | undefined;
  let dataLength: number | undefined;
  for (let offset = 12; offset < riffEnd;) {
    if (offset + 8 > riffEnd) throw new Error("Final WAV contains a truncated chunk header.");
    const name = await readFourCC(blob, offset);
    const size = (await readExact(blob, offset + 4, 4)).getUint32(0, true);
    const dataStart = offset + 8;
    const end = dataStart + size;
    if (end > riffEnd) throw new Error("Final WAV contains a truncated chunk.");
    if (name === "fmt ") {
      if (format) throw new Error("Final WAV contains duplicate format chunks.");
      if (size < 16) throw new Error("Final WAV format metadata is incomplete.");
      const fmt = await readExact(blob, dataStart, 16);
      let tag = fmt.getUint16(0, true);
      if (tag === 0xfffe && size >= 40) {
        const subformat = await readExact(blob, dataStart + 24, 16);
        const pcmGuidTail = [0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];
        if (subformat.getUint32(0, true) === 1 && pcmGuidTail.every((byte, index) => subformat.getUint8(index + 4) === byte)) tag = 1;
      }
      format = { tag, channels: fmt.getUint16(2, true), sampleRate: fmt.getUint32(4, true), byteRate: fmt.getUint32(8, true), blockAlign: fmt.getUint16(12, true), bits: fmt.getUint16(14, true) };
    } else if (name === "data") {
      if (dataLength !== undefined) throw new Error("Final WAV contains duplicate audio-data chunks.");
      dataLength = size;
    }
    offset = end + (size % 2);
    if (offset > riffEnd) throw new Error("Final WAV is missing required chunk padding.");
  }
  if (!format || dataLength === undefined) throw new Error("Final WAV must contain format and audio data chunks.");
  if (format.tag !== 1 || format.sampleRate !== 48_000 || ![1, 2].includes(format.channels) || format.bits !== 24) throw new Error("Final WAV must be 48 kHz mono or stereo PCM; output must use 24-bit samples.");
  const expectedAlign = format.channels * 3;
  if (format.blockAlign !== expectedAlign || format.byteRate !== 48_000 * expectedAlign || dataLength <= 0 || dataLength % expectedAlign !== 0) throw new Error("Final WAV PCM layout or data length is invalid.");
  const actualDuration = dataLength / format.byteRate;
  if (Math.abs(actualDuration - metadata.durationSeconds) > Math.max(0.05, 1 / 48_000)) throw new Error("Final WAV duration does not match its audio data.");
  return { ...metadata, durationSeconds: actualDuration };
}

export async function saveFinalSource(sourceRef: string, file: File): Promise<void> {
  assertKey(sourceRef, "Source reference");
  if (!file || typeof file.name !== "string" || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > FINAL_SOURCE_MAX_BYTES || typeof file.slice !== "function") throw new Error("The original file is invalid or exceeds the local source-storage limit.");
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("The original file could not be read locally."));
    reader.onerror = () => reject(reader.error ?? new Error("The original file could not be read locally."));
    reader.readAsArrayBuffer(file);
  });
  const db = await openDatabase();
  try {
    const tx = db.transaction(sourceStoreName, "readwrite");
    tx.objectStore(sourceStoreName).add({ sourceRef, name: file.name, type: file.type, lastModified: file.lastModified, bytes, storedAt: Date.now() } satisfies StoredSource);
    await transactionDone(tx);
  } finally { db.close(); }
}

export async function openFinalSource(sourceRef: string): Promise<File | undefined> {
  assertKey(sourceRef, "Source reference");
  const db = await openDatabase();
  try {
    const record = await requestResult(db.transaction(sourceStoreName, "readonly").objectStore(sourceStoreName).get(sourceRef)) as StoredSource | undefined;
    if (!record) return undefined;
    const storedBytes = record.bytes as ArrayBuffer | undefined;
    if (!storedBytes || typeof storedBytes.byteLength !== "number" || storedBytes.byteLength === 0 || storedBytes.byteLength > FINAL_SOURCE_MAX_BYTES || typeof record.name !== "string" || !record.name.trim() || typeof record.type !== "string" || !Number.isFinite(record.lastModified)) throw new Error("The retained original file is invalid or exceeds the local storage limit.");
    const source = new File([storedBytes], record.name, { type: record.type, lastModified: record.lastModified });
    if (source.size !== storedBytes.byteLength) throw new Error("The retained original file is truncated or unreadable.");
    return source;
  } finally { db.close(); }
}

export async function retainFinalOutput(artifactId: string, blob: Blob, metadata: { fileName: string; mimeType: string; durationSeconds: number }): Promise<FinalOutputMetadata> {
  if (!isBlob(blob)) throw new Error("The final output data is unavailable.");
  assertKey(metadata.fileName, "Output file name");
  if (metadata.mimeType !== "audio/wav") throw new Error("Final output must be identified as WAV audio.");
  const artifact = await validateFinalWav(blob, { artifactId, fileName: metadata.fileName, mimeType: metadata.mimeType as "audio/wav", sizeBytes: blob.size, durationSeconds: metadata.durationSeconds, validated: true });
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("The final output could not be read locally."));
    reader.onerror = () => reject(reader.error ?? new Error("The final output could not be read locally."));
    reader.readAsArrayBuffer(blob);
  });
  const db = await openDatabase();
  try {
    const tx = db.transaction(outputStoreName, "readwrite");
    tx.objectStore(outputStoreName).add({ ...artifact, bytes, storedAt: Date.now() } satisfies StoredOutput);
    await transactionDone(tx);
  } finally { db.close(); }
  return artifact;
}

export async function openFinalOutput(artifactId: string): Promise<{ blob: Blob } & FinalOutputMetadata | undefined> {
  assertKey(artifactId, "Artifact ID");
  const db = await openDatabase();
  let record: StoredOutput | undefined;
  try { record = await requestResult(db.transaction(outputStoreName, "readonly").objectStore(outputStoreName).get(artifactId)) as StoredOutput | undefined; }
  finally { db.close(); }
  if (!record) return undefined;
  if (!record.bytes || record.bytes.byteLength !== record.sizeBytes) throw new Error("The retained final output data is unavailable.");
  const blob = new Blob([record.bytes], { type: record.mimeType });
  const metadata = await validateFinalWav(blob, record);
  return { ...metadata, blob };
}

export async function removeFinalSource(sourceRef: string): Promise<void> {
  assertKey(sourceRef, "Source reference");
  const db = await openDatabase();
  try { const tx = db.transaction(sourceStoreName, "readwrite"); tx.objectStore(sourceStoreName).delete(sourceRef); await transactionDone(tx); }
  finally { db.close(); }
}

export async function removeFinalOutput(artifactId: string): Promise<void> {
  assertKey(artifactId, "Artifact ID");
  const db = await openDatabase();
  try { const tx = db.transaction(outputStoreName, "readwrite"); tx.objectStore(outputStoreName).delete(artifactId); await transactionDone(tx); }
  finally { db.close(); }
}

export async function listFinalArtifactIds(): Promise<string[]> {
  const db = await openDatabase();
  try { const records = await requestResult(db.transaction(outputStoreName, "readonly").objectStore(outputStoreName).getAll()) as StoredOutput[]; return records.map((record) => record.artifactId); }
  finally { db.close(); }
}

export async function listFinalSourceRefs(): Promise<string[]> {
  const db = await openDatabase();
  try { const records = await requestResult(db.transaction(sourceStoreName, "readonly").objectStore(sourceStoreName).getAll()) as StoredSource[]; return records.map((record) => record.sourceRef); }
  finally { db.close(); }
}

export async function removeFinalOutputs(ids: string[]) {
  const results: { id: string; removed: boolean; error?: string }[] = [];
  for (const id of [...new Set(ids)]) {
    try { await removeFinalOutput(id); results.push({ id, removed: true }); }
    catch { results.push({ id, removed: false, error: "Final output could not be removed from local storage." }); }
  }
  return results;
}

export async function removeFinalSources(sourceRefs: string[]) {
  const results: { id: string; removed: boolean; error?: string }[] = [];
  for (const id of [...new Set(sourceRefs)]) {
    try { await removeFinalSource(id); results.push({ id, removed: true }); }
    catch { results.push({ id, removed: false, error: "Retained retry source could not be removed from local storage." }); }
  }
  return results;
}
