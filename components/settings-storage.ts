import { defaultSettings, normalizeSettings, type AppSettings } from "@/shared/contracts/settings";

export const SETTINGS_STORAGE_KEY = "clearwave.settings.v1";

export function getLocalStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

export function loadSettings(storage: Storage | undefined): AppSettings {
  if (!storage) return defaultSettings;
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? "null")); } catch { return defaultSettings; }
}

export function saveSettings(storage: Storage | undefined, settings: AppSettings) {
  try { storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Local UI remains usable when storage is unavailable. */ }
}

export function clearLocalGeneratedData(storage: Storage | undefined, scope: "previews" | "outputs" | "history" | "all") {
  if (!storage) return;
  const keys = scope === "all" ? ["clearwave.previews", "clearwave.outputs", "clearwave.history"] : [`clearwave.${scope}`];
  keys.forEach((key) => storage.removeItem(key));
}
