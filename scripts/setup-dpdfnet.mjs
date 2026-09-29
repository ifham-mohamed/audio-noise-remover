import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import console from "node:console";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelDirectory = path.join(projectRoot, "models");
const modelName = "dpdfnet2_48khz_hr.onnx";
const modelPath = path.join(modelDirectory, modelName);
const manifestPath = path.join(modelDirectory, "manifest.json");
const temporaryPath = path.join(modelDirectory, `.${modelName}.${process.pid}.part`);
const revision = "c7ac7b249ff5e17fa606794dc4f68ed9a544834f";
const expectedSha256 = "7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b";
const sourceUrl = `https://huggingface.co/Ceva-IP/DPDFNet/resolve/${revision}/onnx/${modelName}?download=true`;

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

await mkdir(modelDirectory, { recursive: true });
try {
  const existingHash = await hashFile(modelPath);
  if (existingHash !== expectedSha256) {
    throw new Error(`Existing ${modelName} has an unexpected SHA-256. It was left unchanged; move it aside before setup.`);
  }
  console.log(`${modelName} is already present and verified.`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  const response = await globalThis.fetch(sourceUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`Model download failed with HTTP ${response.status}.`);
  const modelBytes = Buffer.from(await response.arrayBuffer());
  const actualSha256 = createHash("sha256").update(modelBytes).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error(`Downloaded model SHA-256 mismatch: ${actualSha256}`);
  await writeFile(temporaryPath, modelBytes, { flag: "wx" });
  await rename(temporaryPath, modelPath);
  console.log(`${modelName} downloaded and SHA-256 verified.`);
}

const manifest = {
  modelId: "ceva-ip/dpdfnet2_48khz_hr",
  version: revision,
  file: modelName,
  sha256: expectedSha256,
  license: "Apache-2.0",
  sampleRateHz: 48000,
  channels: 1,
  usage: "experimental-preview-candidate; not production-qualified",
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await rm(temporaryPath, { force: true });
console.log(`Local model manifest written to ${path.relative(projectRoot, manifestPath)}.`);
