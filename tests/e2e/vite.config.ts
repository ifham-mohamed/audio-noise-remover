import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: repositoryRoot,
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
  resolve: { alias: { "@": repositoryRoot } },
  optimizeDeps: { include: ["onnxruntime-web/wasm"], exclude: ["@ffmpeg/ffmpeg"] },
  server: { fs: { allow: [repositoryRoot] } },
  plugins: [{ name: "local-test-model", configureServer(server) {
    server.middlewares.use("/api/preview-model", async (_request, response) => {
      try {
        const bytes = await readFile(fileURLToPath(new URL("../../models/dpdfnet2_48khz_hr.onnx", import.meta.url)));
        if (createHash("sha256").update(bytes).digest("hex") !== "7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b") {
          response.writeHead(409).end(); return;
        }
        response.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" }).end(bytes);
      } catch { response.writeHead(404).end(); }
    });
  } }],
});
