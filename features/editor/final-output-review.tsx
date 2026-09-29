"use client";

import { useEffect, useState } from "react";
import { openFinalOutput } from "@/features/final/final-artifact-store";
import type { FinalJobOutput } from "@/shared/contracts/final-job";

type FinalOutput = NonNullable<Awaited<ReturnType<typeof openFinalOutput>>>;

export function FinalOutputReview({ expected }: { expected: FinalJobOutput }) {
  const [output, setOutput] = useState<FinalOutput>();
  const [objectUrl, setObjectUrl] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;
    let createdUrl: string | undefined;
    setLoading(true); setOutput(undefined); setObjectUrl(undefined); setError(undefined);
    void openFinalOutput(expected.artifactId).then((artifact) => {
      if (!artifact) throw new Error("The validated final output is no longer available in this browser.");
      if (artifact.artifactId !== expected.artifactId || artifact.fileName !== expected.fileName || artifact.mimeType !== expected.mimeType || artifact.sizeBytes !== expected.sizeBytes || Math.abs(artifact.durationSeconds - expected.durationSeconds) > 0.001) throw new Error("The retained output does not match the successful job record and cannot be presented as its result.");
      if (!active) return;
      createdUrl = URL.createObjectURL(artifact.blob);
      setOutput(artifact); setObjectUrl(createdUrl);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "The local final output could not be reopened or validated."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (createdUrl) URL.revokeObjectURL(createdUrl); };
  }, [expected.artifactId, expected.fileName, expected.mimeType, expected.sizeBytes, expected.durationSeconds]);

  function downloadLocally(artifact: FinalOutput) {
    const url = URL.createObjectURL(artifact.blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = artifact.fileName; anchor.rel = "noopener";
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError(undefined);
    setNotice("The validated WAV download has started in this browser.");
  }

  function saveOutput() {
    if (!output) return;
    setError(undefined); setNotice(undefined);
    downloadLocally(output);
  }

  return <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
    <h3 className="text-sm font-semibold">Review your final output</h3>
    <p className="mt-1 text-xs text-[var(--muted-foreground)]">Experimental, validated WAV · local-only · not production-qualified</p>
    {loading && <p className="mt-3 text-sm" role="status">Reopening and checking the saved output…</p>}
    {error && <p className="mt-3 text-sm text-amber-200" role="alert">{error} The original file is not used as a substitute.</p>}
    {output && objectUrl && <>
      <p className="mt-3 text-sm">{output.fileName} · {Math.round(output.sizeBytes / 1024)} KB · {output.durationSeconds.toFixed(1)} seconds</p>
      <audio className="mt-3 w-full" controls preload="metadata" src={objectUrl} aria-label="Listen to the validated experimental final output" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={saveOutput} className="inline-flex min-h-11 items-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Download WAV</button>
      </div>
    </>}
    {notice && <p className="mt-3 text-sm" role="status">{notice}</p>}
    <p className="mt-3 text-xs text-[var(--muted-foreground)]">Your browser manages the download location. The app does not write over source files.</p>
  </div>;
}
