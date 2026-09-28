import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SettingsProvider } from "@/components/settings-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clearwave Studio",
  description: "Local-first speech and audio enhancement on your device.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SettingsProvider><AppShell>{children}</AppShell></SettingsProvider>
      </body>
    </html>
  );
}
