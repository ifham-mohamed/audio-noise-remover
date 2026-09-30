"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openFinalOutput } from "@/features/final/final-artifact-store";
import type { FinalJobOutput } from "@/shared/contracts/final-job";
import { finalOutputLabel } from "@/shared/contracts/final-output";

type RetainedOutput = NonNullable<Awaited<ReturnType<typeof openFinalOutput>>>;

function matchesRecord(actual: RetainedOutput, expected: FinalJobOutput) {
  return actual.artifactId === expected.artifactId
    && actual.fileName === expected.fileName
    && actual.mimeType === expected.mimeType
    && (!expected.sha256 || actual.sha256 === expected.sha256)
    && actual.sizeBytes === expected.sizeBytes
    && Math.abs(actual.durationSeconds - expected.durationSeconds) <= 0.001;
}

export function HistoryOutputActions({ expected }: { expected: FinalJobOutput }) {
  const [output, setOutput] = useState<RetainedOutput>();
  const [loading, setLoading] = useState(true);
  const [downloadAvailable, setDownloadAvailable] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [copyFallback, setCopyFallback] = useState(false);
  const downloadUrl = useRef<string | undefined>(undefined);
  const downloadRevokeTimer = useRef<number | undefined>(undefined);
  const platform = typeof navigator === "undefined" ? "your device" : (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ?? navigator.platform ?? "your device";

  const releaseDownloadUrl = useCallback(() => {
    if (downloadRevokeTimer.current !== undefined) window.clearTimeout(downloadRevokeTimer.current);
    downloadRevokeTimer.current = undefined;
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = undefined;
  }, []);

  useEffect(() => {
    setDownloadAvailable(typeof URL.createObjectURL === "function" && "download" in document.createElement("a"));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setOutput(undefined); setProblem("");
    void openFinalOutput(expected.artifactId).then((artifact) => {
      if (!artifact || !matchesRecord(artifact, expected)) throw new Error("This output is not available or no longer matches its validated history record in this browser.");
      if (active) setOutput(artifact);
    }).catch((cause) => {
      if (active) setProblem(cause instanceof Error ? cause.message : "The saved output could not be checked in this browser.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; releaseDownloadUrl(); };
  }, [expected.artifactId, expected.fileName, expected.mimeType, expected.sizeBytes, expected.durationSeconds, releaseDownloadUrl]);

  async function save() {
    setNotice(""); setProblem("");
    try {
      const artifact = await openFinalOutput(expected.artifactId);
      if (!artifact || !matchesRecord(artifact, expected)) {
        setOutput(undefined);
        releaseDownloadUrl();
        throw new Error("The validated output is no longer available in this browser.");
      }
      if (downloadRevokeTimer.current !== undefined) window.clearTimeout(downloadRevokeTimer.current);
      const url = downloadUrl.current ?? URL.createObjectURL(artifact.blob);
      downloadUrl.current = url;
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = artifact.fileName; anchor.rel = "noopener";
      document.body.append(anchor); anchor.click(); anchor.remove();
      downloadRevokeTimer.current = window.setTimeout(() => {
        if (downloadUrl.current === url) releaseDownloadUrl();
      }, 60_000);
      setNotice(`Your browser has been asked to download this ${finalOutputLabel(artifact.mimeType)}. It will handle saving the copy.`);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "The output could not be saved.");
    }
  }

  async function copyName() {
    setNotice(""); setProblem(""); setCopyFallback(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(expected.fileName);
      setNotice("Output file name copied. Browsers do not expose the saved file’s full device path.");
    } catch {
      setCopyFallback(true);
      setNotice("Clipboard access is unavailable. Select and copy the output file name below.");
    }
  }

  return <div className="mt-3 space-y-2" role="group" aria-label="Local output actions">
    {loading ? <p role="status">Checking the saved output in this browser…</p> : null}
    {problem ? <p role="status">{problem} No source media is used as a substitute.</p> : null}
    {!loading && output ? <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void save()} disabled={!downloadAvailable} aria-describedby={!downloadAvailable ? `download-help-${expected.artifactId}` : undefined} className="inline-flex min-h-11 items-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60">Download {finalOutputLabel(expected.mimeType)}</button>
      <button type="button" onClick={() => void copyName()} className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Copy output name</button>
      <button type="button" disabled aria-describedby={`path-help-${expected.artifactId}`} className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium opacity-60">Copy output path</button>
      <button type="button" disabled aria-describedby={`folder-help-${expected.artifactId}`} className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium opacity-60">Show in folder</button>
      <p id={`path-help-${expected.artifactId}`} className="basis-full text-xs text-[var(--muted-foreground)]">This browser stores the output locally and does not expose its full device path. You can save/download it or copy the file name.</p>
      <p id={`folder-help-${expected.artifactId}`} className="basis-full text-xs text-[var(--muted-foreground)]">This browser cannot reveal a local folder. {platform} handles downloads; use Download to choose where to keep a copy.</p>
      {!downloadAvailable ? <p id={`download-help-${expected.artifactId}`} className="basis-full text-xs text-[var(--muted-foreground)]">This browser does not support a safe local download for the retained output.</p> : null}
    </div> : null}
    {copyFallback && output ? <input readOnly aria-label="Selectable output file name" value={output.fileName} onFocus={(event) => event.currentTarget.select()} className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3" /> : null}
    {notice ? <p role="status" aria-live="polite">{notice}</p> : null}
  </div>;
}
