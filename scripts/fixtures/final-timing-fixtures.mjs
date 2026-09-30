import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { pathToFileURL, URL } from "node:url";
import process from "node:process";
import console from "node:console";

/** Synthetic test media only. Generated with the exact bundled core, entirely
 * in its private memory filesystem; does not start a server or write host files.
 */
export async function createFinalTimingFixtures() {
  const scriptURL = new URL("../../public/ffmpeg/ffmpeg-core.js", import.meta.url);
  const wasmURL = new URL("../../public/ffmpeg/ffmpeg-core.wasm", import.meta.url);
  const descriptors = new Map(["self", "location", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "self", { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { href: "http://localhost/ffmpeg/ffmpeg-core.js" } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  let core;
  try {
    const { default: createCore } = await import(scriptURL.href);
    core = await createCore({ wasmBinary: new Uint8Array(await readFile(wasmURL)), mainScriptUrlOrBlob: `http://localhost/ffmpeg/ffmpeg-core.js#${Buffer.from(JSON.stringify({ wasmURL: wasmURL.href, workerURL: "" })).toString("base64")}` });
    core.setLogger(() => {});
    core.FS.writeFile("/tone.mp4", new Uint8Array(await readFile(new URL("../../tests/fixtures/preview/tone.mp4", import.meta.url))));
    const generate = (args, output) => {
      core.exec("-nostdin", "-y", ...args, "-c", "copy", "-avoid_negative_ts", "disabled", "-f", "matroska", output);
      if (core.ret !== 0) throw new Error("Bundled core failed to generate synthetic timing fixture.");
      return Buffer.from(core.FS.readFile(output)).toString("base64");
    };
    return {
      delayedFirst: generate(["-copyts", "-i", "/tone.mp4", "-itsoffset", "0.03", "-i", "/tone.mp4", "-map", "0:v", "-map", "1:a:0"], "/delayed-first.mkv"),
      delayedSecond: generate(["-copyts", "-i", "/tone.mp4", "-itsoffset", "0.03", "-i", "/tone.mp4", "-map", "0:v", "-map", "0:a:0", "-map", "1:a:0"], "/delayed-second.mkv"),
      commonOrigin: generate(["-copyts", "-itsoffset", "5", "-i", "/tone.mp4", "-map", "0:v", "-map", "0:a:0"], "/common-origin.mkv"),
    };
  } finally {
    if (core) {
      for (const name of ["/tone.mp4", "/delayed-first.mkv", "/delayed-second.mkv", "/common-origin.mkv"]) {
        try { core.FS.unlink(name); } catch { /* A failed generation may not create every fixture. */ }
      }
      core.reset();
    }
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await createFinalTimingFixtures()));
}
