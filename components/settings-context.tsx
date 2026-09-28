"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultSettings, type AppSettings } from "@/shared/contracts/settings";
import { getLocalStorage, loadSettings, saveSettings } from "@/components/settings-storage";
const SettingsContext = createContext<{ settings: AppSettings; updateSettings: (next: AppSettings) => void }>({ settings: defaultSettings, updateSettings: () => undefined });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(defaultSettings);
  useEffect(() => { setSettings(loadSettings(getLocalStorage())); }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.appearance.theme;
    root.dataset.density = settings.appearance.density;
    root.dataset.reducedMotion = String(settings.appearance.reducedMotion);
    root.dataset.waveformContrast = settings.appearance.waveformContrast;
    saveSettings(getLocalStorage(), settings);
  }, [settings]);
  return <SettingsContext.Provider value={useMemo(() => ({ settings, updateSettings: setSettings }), [settings])}>{children}</SettingsContext.Provider>;
}
export function useSettings() { return useContext(SettingsContext); }
