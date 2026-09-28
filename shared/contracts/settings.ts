import { z } from "zod";

export const settingsSchema = z.object({ version: z.literal(1),
  appearance: z.object({ theme: z.enum(["system", "light", "dark"]), density: z.enum(["comfortable", "compact"]), reducedMotion: z.boolean(), waveformContrast: z.enum(["standard", "high"]) }),
  playback: z.object({ seekInterval: z.enum(["5", "10", "15", "30"]), autoplayPreview: z.boolean(), keyboardShortcuts: z.boolean() }),
  output: z.object({ format: z.enum(["audio-wav", "source-video", "mp4"]), quality: z.enum(["standard", "high"]), destination: z.enum(["browser", "ask"]), overwriteConfirmation: z.enum(["always", "ask"]) }),
  accessibility: z.object({ announcements: z.enum(["minimal", "standard", "verbose"]), focusBehavior: z.enum(["restore", "main"]) }),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: AppSettings = {
  version: 1,
  appearance: { theme: "system", density: "comfortable", reducedMotion: false, waveformContrast: "standard" },
  playback: { seekInterval: "5", autoplayPreview: false, keyboardShortcuts: true },
  output: { format: "audio-wav", quality: "high", destination: "ask", overwriteConfirmation: "always" },
  accessibility: { announcements: "standard", focusBehavior: "restore" },
};
export function normalizeSettings(value: unknown): AppSettings { const parsed = settingsSchema.safeParse(value); return parsed.success ? parsed.data : defaultSettings; }
