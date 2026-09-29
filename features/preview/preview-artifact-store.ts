import { previewArtifactSchema, type PreviewArtifact } from "@/shared/contracts/preview";

const databaseName = "ai-noice-removal-preview-artifacts";
const objectStoreName = "artifacts";
const databaseVersion = 1;
const maxArtifactBytes = 64 * 1024 * 1024;
const maxPreviewDurationSeconds = 30.05;
const previewRetentionMs = 7 * 24 * 60 * 60 * 1000;

type StoredPreviewArtifact = PreviewArtifact & { createdAt: number; audioBytes: ArrayBuffer };

function readBlob(blob: Blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Local preview audio could not be read."));
    reader.onerror = () => reject(reader.error ?? new Error("Local preview audio could not be read."));
    reader.readAsArrayBuffer(blob);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local preview storage request failed."));
  });
}

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Local preview storage is unavailable in this browser."));
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(objectStoreName)) request.result.createObjectStore(objectStoreName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local preview storage could not be opened."));
    request.onblocked = () => reject(new Error("Local preview storage is busy in another tab."));
  });
}

async function inspectPlayableWav(blob: Blob) {
  if (blob.type.toLowerCase() !== "audio/wav") throw new Error("Only validated local WAV preview artifacts can be retained.");
  if (blob.size < 44 || blob.size > maxArtifactBytes) throw new Error("The preview artifact size is invalid or exceeds the local storage limit.");
  const readPart = async (start: number, length: number) => {
    const bytes = await readBlob(blob.slice(start, start + length));
    if (bytes.byteLength !== length) throw new Error("The preview WAV contains a truncated header.");
    return new DataView(bytes);
  };
  const readText = async (offset: number, length: number) => {
    const view = await readPart(offset, length);
    return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset, length));
  };
  if (await readText(0, 4) !== "RIFF" || await readText(8, 4) !== "WAVE") throw new Error("The preview artifact is not a RIFF/WAVE audio file.");
  const riffSize = await readPart(4, 4);
  const riffEnd = riffSize.getUint32(0, true) + 8;
  if (riffEnd > blob.size || riffEnd < 44) throw new Error("The preview WAV header declares an invalid file length.");

  let format: { tag: number; channels: number; sampleRate: number; bitsPerSample: number } | undefined;
  let dataBytes: number | undefined;
  for (let offset = 12; offset < riffEnd;) {
    if (offset + 8 > riffEnd) throw new Error("The preview WAV contains a truncated chunk header.");
    const chunkName = await readText(offset, 4);
    const sizeView = await readPart(offset + 4, 4);
    const chunkSize = sizeView.getUint32(0, true);
    const chunkEnd = offset + 8 + chunkSize;
    if (chunkEnd > riffEnd) throw new Error("The preview WAV contains a truncated chunk.");
    if (chunkName === "fmt ") {
      if (chunkSize < 16) throw new Error("The preview WAV format header is incomplete.");
      const fmt = await readPart(offset + 8, 16);
      let tag = fmt.getUint16(0, true);
      if (tag === 0xfffe && chunkSize >= 40) {
        const subformat = await readPart(offset + 8 + 24, 16);
        const suffix = [0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];
        if (suffix.every((value, index) => subformat.getUint8(4 + index) === value)) tag = subformat.getUint32(0, true);
      }
      format = { tag, channels: fmt.getUint16(2, true), sampleRate: fmt.getUint32(4, true), bitsPerSample: fmt.getUint16(14, true) };
    }
    if (chunkName === "data") dataBytes = chunkSize;
    offset = chunkEnd + (chunkSize % 2);
    if (offset > riffEnd) throw new Error("The preview WAV contains a truncated chunk padding byte.");
  }

  if (!format || dataBytes === undefined) throw new Error("The preview WAV is missing its format or audio data chunk.");
  const validPcm = format.tag === 1 && [16, 24, 32].includes(format.bitsPerSample);
  const validFloat = format.tag === 3 && format.bitsPerSample === 32;
  if ((!validPcm && !validFloat) || ![1, 2].includes(format.channels) || format.sampleRate !== 48_000) {
    throw new Error("The preview WAV must contain mono or stereo 48 kHz PCM audio.");
  }
  const bytesPerFrame = format.channels * format.bitsPerSample / 8;
  if (dataBytes <= 0 || dataBytes % bytesPerFrame !== 0) throw new Error("The preview WAV audio data is not frame-aligned.");
  return dataBytes / bytesPerFrame / format.sampleRate;
}

export async function validatePreviewArtifactBlob(artifactInput: unknown, blob: Blob): Promise<PreviewArtifact> {
  const artifact = previewArtifactSchema.parse(artifactInput);
  if (artifact.mimeType !== "audio/wav") throw new Error("Preview artifact metadata must identify playable WAV audio.");
  // IndexedDB may structured-clone Blob instances across realms, where instanceof
  // is unreliable even though the stored value remains a standards-compliant Blob.
  if (!blob || typeof blob !== "object" || typeof blob.size !== "number" || typeof blob.slice !== "function" || typeof blob.type !== "string" || blob.size !== artifact.sizeBytes) {
    throw new Error("The preview artifact metadata does not match its local audio data.");
  }
  const actualDuration = await inspectPlayableWav(blob);
  if (actualDuration > maxPreviewDurationSeconds) throw new Error("The preview artifact exceeds the bounded 30-second preview duration.");
  if (Math.abs(actualDuration - artifact.durationSeconds) > Math.max(0.05, 1 / 48_000)) throw new Error("The preview artifact duration does not match its WAV data.");
  return artifact;
}

export async function retainPreviewArtifact(artifactInput: unknown, blob: Blob) {
  const artifact = await validatePreviewArtifactBlob(artifactInput, blob);
  const audioBytes = await readBlob(blob);
  const db = await openDatabase();
  try {
    const transaction = db.transaction(objectStoreName, "readwrite");
    transaction.objectStore(objectStoreName).put({ ...artifact, createdAt: Date.now(), audioBytes } satisfies StoredPreviewArtifact);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The preview artifact could not be retained locally."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local preview artifact storage was interrupted."));
    });
  } finally {
    db.close();
  }
  await pruneExpiredPreviewArtifacts();
}

export async function retainPreviewArtifactPair(sourceInput: unknown, sourceBlob: Blob, enhancedInput: unknown, enhancedBlob: Blob) {
  const source = await validatePreviewArtifactBlob(sourceInput, sourceBlob);
  const enhanced = await validatePreviewArtifactBlob(enhancedInput, enhancedBlob);
  if (source.id === enhanced.id || Math.abs(source.durationSeconds - enhanced.durationSeconds) > 0.05) {
    throw new Error("The Before and After preview artifacts do not form a matching pair.");
  }
  const [sourceBytes, enhancedBytes] = await Promise.all([readBlob(sourceBlob), readBlob(enhancedBlob)]);
  const createdAt = Date.now();
  const db = await openDatabase();
  try {
    const transaction = db.transaction(objectStoreName, "readwrite");
    const store = transaction.objectStore(objectStoreName);
    store.put({ ...source, createdAt, audioBytes: sourceBytes } satisfies StoredPreviewArtifact);
    store.put({ ...enhanced, createdAt, audioBytes: enhancedBytes } satisfies StoredPreviewArtifact);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The paired preview audio could not be retained locally."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Paired preview storage was interrupted."));
    });
  } finally {
    db.close();
  }
  await pruneExpiredPreviewArtifacts();
}

export async function openPreviewArtifact(id: string) {
  const db = await openDatabase();
  let record: StoredPreviewArtifact | undefined;
  try {
    record = await requestResult(db.transaction(objectStoreName, "readonly").objectStore(objectStoreName).get(id)) as StoredPreviewArtifact | undefined;
  } finally {
    db.close();
  }
  if (!record) return undefined;
  if (Date.now() - record.createdAt > previewRetentionMs) {
    await removePreviewArtifact(id);
    return undefined;
  }
  if (!record.audioBytes || Object.prototype.toString.call(record.audioBytes) !== "[object ArrayBuffer]" || typeof record.audioBytes.byteLength !== "number") {
    throw new Error("The retained preview audio data is unavailable.");
  }
  const blob = new Blob([record.audioBytes], { type: record.mimeType });
  const artifact = await validatePreviewArtifactBlob(record, blob);
  return { ...artifact, url: URL.createObjectURL(blob) };
}

export function releasePreviewArtifactUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

export async function removePreviewArtifact(id: string) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(objectStoreName, "readwrite");
    transaction.objectStore(objectStoreName).delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The preview artifact could not be removed locally."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local preview artifact cleanup was interrupted."));
    });
  } finally {
    db.close();
  }
}

export async function removePreviewArtifactPair(ids: string[]) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(objectStoreName, "readwrite");
    const store = transaction.objectStore(objectStoreName);
    for (const id of new Set(ids)) store.delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The paired preview artifacts could not be removed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Paired preview cleanup was interrupted."));
    });
  } finally {
    db.close();
  }
}

export async function pruneExpiredPreviewArtifacts(now = Date.now()) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(objectStoreName, "readwrite");
    const store = transaction.objectStore(objectStoreName);
    const records = await requestResult(store.getAll()) as StoredPreviewArtifact[];
    for (const record of records) if (now - record.createdAt > previewRetentionMs) store.delete(record.id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Expired preview artifacts could not be cleaned up."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Preview cleanup was interrupted."));
    });
  } finally {
    db.close();
  }
}
