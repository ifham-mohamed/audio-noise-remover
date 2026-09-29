import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const modelPath = path.join(process.cwd(), "models", "dpdfnet2_48khz_hr.onnx");
const pinnedSha256 = "7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b";

export async function GET() {
  let bytes: Buffer;
  try {
    bytes = await readFile(modelPath);
  } catch {
    return Response.json({ error: "The pinned experimental speech model is not installed. Run local model setup." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (createHash("sha256").update(bytes).digest("hex") !== pinnedSha256) {
    return Response.json({ error: "The installed speech model failed its checksum check." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
