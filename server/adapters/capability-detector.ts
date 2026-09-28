import { access, constants, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CapabilityDetector } from "@/server/ports/capability-detector";
import type { CapabilityItem, CapabilityReport } from "@/shared/contracts/capabilities";

const execFileAsync = promisify(execFile);
const LOW_SPACE_BYTES = 2 * 1024 * 1024 * 1024;

type DetectorOptions = {
  now?: () => Date;
  cwd?: string;
  runCommand?: (command: string) => Promise<string>;
  inspectStorage?: (directory: string) => Promise<{ writable: boolean; availableBytes: number }>;
  modelManifest?: () => Promise<{ version: string; license?: string } | null>;
  platform?: NodeJS.Platform;
  architecture?: string;
  nodeVersion?: string;
  accelerationProvider?: string | null;
};

async function defaultRunCommand(command: string) {
  const { stdout } = await execFileAsync(process.env.FFMPEG_PATH || command, ["-version"], { timeout: 2500, windowsHide: true });
  return stdout.split("\n")[0] ?? "";
}

async function defaultInspectStorage(directory: string) {
  let probeDirectory: string | undefined;
  try {
    await access(directory, constants.R_OK | constants.W_OK);
    probeDirectory = await mkdtemp(path.join(directory, ".clearwave-write-probe-"));
    await writeFile(path.join(probeDirectory, "probe"), "clearwave");
    const stats = await statfs(directory);
    return { writable: true, availableBytes: Number(stats.bavail) * Number(stats.bsize) };
  } catch {
    return { writable: false, availableBytes: 0 };
  } finally {
    if (probeDirectory) await rm(probeDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function defaultModelManifest(directory: string) {
  try {
    const raw = await readFile(path.join(directory, "models", "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as { version?: unknown; license?: unknown };
    if (typeof manifest.version !== "string") return null;
    const license = typeof manifest.license === "string" && /^[A-Za-z0-9 .+\-]{1,40}$/.test(manifest.license) ? manifest.license : undefined;
    return { version: manifest.version, license };
  } catch {
    return null;
  }
}

export function createCapabilityDetector(options: DetectorOptions = {}): CapabilityDetector {
  const cwd = options.cwd ?? process.cwd();
  const runCommand = options.runCommand ?? defaultRunCommand;
  const inspectStorage = options.inspectStorage ?? defaultInspectStorage;
  const modelManifest = options.modelManifest ?? (() => defaultModelManifest(cwd));

  return {
    async detect() {
      const items: CapabilityItem[] = [];
      const runtime = {
        nodeVersion: options.nodeVersion ?? process.version,
        os: options.platform ?? process.platform,
        architecture: options.architecture ?? process.arch,
      };

      let ffmpegVersion: string | undefined;
      try {
        const firstLine = await runCommand("ffmpeg");
        ffmpegVersion = firstLine.match(/ffmpeg version\s+([^\s]+)/i)?.[1];
        if (!ffmpegVersion) throw new Error("FFmpeg version could not be verified");
        items.push({ id: "ffmpeg", label: "FFmpeg", status: "ready", summary: "Media inspection is available locally.", version: ffmpegVersion });
      } catch {
        items.push({ id: "ffmpeg", label: "FFmpeg", status: "unavailable", code: "FFMPEG_UNAVAILABLE", summary: "FFmpeg was not found or could not be verified.", actionLabel: "Install or configure FFmpeg" });
      }

      const manifest = await modelManifest();
      items.push(manifest
        ? { id: "models", label: "Speech models", status: "ready", summary: `A local model is available${manifest.license ? ` under ${manifest.license}.` : "."}`, version: manifest.version }
        : { id: "models", label: "Speech models", status: "unavailable", code: "MODEL_UNAVAILABLE", summary: "No local speech model manifest was found yet.", actionLabel: "Open setup guidance" });

      const storage = await inspectStorage(cwd);
      if (!storage.writable) {
        items.push({ id: "storage", label: "Local storage", status: "attention", code: "STORAGE_NOT_WRITABLE", summary: "The local application folder is not writable.", actionLabel: "Check folder permissions" });
      } else if (storage.availableBytes < LOW_SPACE_BYTES) {
        items.push({ id: "storage", label: "Local storage", status: "attention", code: "DISK_SPACE_LOW", summary: `Only ${Math.round(storage.availableBytes / 1024 / 1024)} MB is available for temporary work and outputs.`, actionLabel: "Open cleanup settings" });
      } else {
        items.push({ id: "storage", label: "Local storage", status: "ready", summary: `${Math.round(storage.availableBytes / 1024 / 1024 / 1024)} GB available and writable.` });
      }

      const provider = options.accelerationProvider ?? null;
      items.push(provider
        ? { id: "compute", label: "Compute", status: "ready", summary: `${provider} is available; CPU remains supported as a fallback.` }
        : { id: "compute", label: "Compute", status: "limited", code: "ACCELERATOR_UNAVAILABLE", summary: "CPU-safe processing is ready; no optional accelerator was detected." });

      return { generatedAt: (options.now ?? (() => new Date()))().toISOString(), requestId: "pending", runtime, items };
    },
  };
}

export const capabilityDetector = createCapabilityDetector();
