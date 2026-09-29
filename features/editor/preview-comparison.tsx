"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/features/editor/waveform-timeline";
import { openPreviewArtifact, releasePreviewArtifactUrl } from "@/features/preview/preview-artifact-store";
import type { PreviewJob } from "@/shared/contracts/preview";

type Side = "before" | "after";
type Mode = Side | "ab";
type LoadedPair = { beforeUrl: string; afterUrl: string };
const peakCount = 56;

async function readWaveform(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The local preview waveform could not be read.");
  const bytes = await response.arrayBuffer();
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return undefined;
  const context = new AudioContextConstructor();
  try {
    const audio = await context.decodeAudioData(bytes);
    const channel = audio.getChannelData(0);
    return Array.from({ length: peakCount }, (_, bucket) => {
      const start = Math.floor(bucket * channel.length / peakCount);
      const end = Math.max(start + 1, Math.floor((bucket + 1) * channel.length / peakCount));
      let peak = 0;
      for (let index = start; index < Math.min(end, channel.length); index++) peak = Math.max(peak, Math.abs(channel[index]));
      return Math.max(6, Math.round(peak * 100));
    });
  } finally {
    await context.close();
  }
}

export function PreviewComparison({ job }: { job: PreviewJob }) {
  const beforeRef = useRef<HTMLAudioElement>(null);
  const afterRef = useRef<HTMLAudioElement>(null);
  const switchSequence = useRef(0);
  const playIntent = useRef(false);
  const timeInputEditing = useRef(false);
  const [pair, setPair] = useState<LoadedPair>();
  const [loadError, setLoadError] = useState(false);
  const [beforePeaks, setBeforePeaks] = useState<number[]>();
  const [afterPeaks, setAfterPeaks] = useState<number[]>();
  const [mode, setMode] = useState<Mode>("before");
  const [abSide, setAbSide] = useState<Side>("before");
  const [position, setPosition] = useState(0);
  const [timeInput, setTimeInput] = useState("0");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const duration = Math.max(0, job.range.endSeconds - job.range.startSeconds);
  const activeSide: Side = mode === "ab" ? abSide : mode;
  const activeAudio = activeSide === "before" ? beforeRef : afterRef;

  function commitTimeInput() {
    const raw = timeInput.trim();
    const value = Number(raw);
    timeInputEditing.current = false;
    if (raw && Number.isFinite(value)) seek(value);
    else setTimeInput(String(Math.round(position * 100) / 100));
  }

  useEffect(() => {
    let current = true;
    let beforeUrl: string | undefined;
    let afterUrl: string | undefined;
    setPair(undefined);
    setLoadError(false);
    setBeforePeaks(undefined);
    setAfterPeaks(undefined);
    setPlaying(false);
    setPosition(0);
    setTimeInput("0");
    timeInputEditing.current = false;
    if (!job.artifact || !job.comparisonSourceArtifact) {
      setLoadError(true);
      return () => { current = false; };
    }
    void Promise.allSettled([
      openPreviewArtifact(job.comparisonSourceArtifact.id),
      openPreviewArtifact(job.artifact.id),
    ]).then(async ([beforeResult, afterResult]) => {
      const before = beforeResult.status === "fulfilled" ? beforeResult.value : undefined;
      const after = afterResult.status === "fulfilled" ? afterResult.value : undefined;
      if (!current) {
        if (before) releasePreviewArtifactUrl(before.url);
        if (after) releasePreviewArtifactUrl(after.url);
        return;
      }
      if (!before || !after) {
        if (before) releasePreviewArtifactUrl(before.url);
        if (after) releasePreviewArtifactUrl(after.url);
        setLoadError(true);
        return;
      }
      beforeUrl = before.url;
      afterUrl = after.url;
      setPair({ beforeUrl, afterUrl });
      void readWaveform(before.url).then((peaks) => { if (current) setBeforePeaks(peaks); }).catch(() => undefined);
      void readWaveform(after.url).then((peaks) => { if (current) setAfterPeaks(peaks); }).catch(() => undefined);
    }).catch(() => { if (current) setLoadError(true); });
    return () => {
      current = false;
      if (beforeUrl) releasePreviewArtifactUrl(beforeUrl);
      if (afterUrl) releasePreviewArtifactUrl(afterUrl);
    };
  }, [job.id, job.artifact?.id, job.comparisonSourceArtifact?.id]);

  useLayoutEffect(() => () => {
    switchSequence.current += 1;
    playIntent.current = false;
    beforeRef.current?.pause();
    afterRef.current?.pause();
  }, [job.id, job.artifact?.id, job.comparisonSourceArtifact?.id]);

  const seek = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(duration, Math.max(0, value));
    setPosition(next);
    if (!timeInputEditing.current) setTimeInput(String(Math.round(next * 100) / 100));
    for (const audio of [beforeRef.current, afterRef.current]) {
      if (audio) audio.currentTime = next;
    }
  }, [duration]);

  async function switchMode(next: Mode) {
    const nextSide: Side = next === "ab" ? (mode === "ab" ? abSide : mode) : next;
    const sequence = ++switchSequence.current;
    const wasPlaying = playing || playIntent.current;
    playIntent.current = wasPlaying;
    const oldAudio = activeAudio.current;
    const targetAudio = nextSide === "before" ? beforeRef.current : afterRef.current;
    const switchPosition = Math.min(duration, Math.max(0, oldAudio && Number.isFinite(oldAudio.currentTime) ? oldAudio.currentTime : position));
    if (oldAudio && oldAudio !== targetAudio) oldAudio.pause();
    setMode(next);
    if (next === "ab") setAbSide(nextSide);
    setPosition(switchPosition);
    if (!timeInputEditing.current) setTimeInput(String(Math.round(switchPosition * 100) / 100));
    if (targetAudio) { targetAudio.currentTime = switchPosition; targetAudio.muted = muted; }
    setPlaybackError(false);
    if (wasPlaying && targetAudio && oldAudio !== targetAudio) {
      try {
        await targetAudio.play();
        if (sequence !== switchSequence.current) {
          if (!playIntent.current || activeAudio.current !== targetAudio) targetAudio.pause();
        }
      }
      catch {
        if (sequence === switchSequence.current) { playIntent.current = false; setPlaying(false); setPlaybackError(true); }
      }
    }
  }

  async function switchAbSide() {
    const sequence = ++switchSequence.current;
    const next: Side = abSide === "before" ? "after" : "before";
    const oldAudio = activeAudio.current;
    const targetAudio = next === "before" ? beforeRef.current : afterRef.current;
    const switchPosition = Math.min(duration, Math.max(0, oldAudio && Number.isFinite(oldAudio.currentTime) ? oldAudio.currentTime : position));
    if (oldAudio) oldAudio.pause();
    setAbSide(next);
    setPosition(switchPosition);
    if (!timeInputEditing.current) setTimeInput(String(Math.round(switchPosition * 100) / 100));
    if (targetAudio) { targetAudio.currentTime = switchPosition; targetAudio.muted = muted; }
    const shouldKeepPlaying = playing || playIntent.current;
    playIntent.current = shouldKeepPlaying;
    if (shouldKeepPlaying && targetAudio) {
      try {
        await targetAudio.play();
        if (sequence !== switchSequence.current) {
          if (!playIntent.current || activeAudio.current !== targetAudio) targetAudio.pause();
        }
      }
      catch {
        if (sequence === switchSequence.current) { playIntent.current = false; setPlaying(false); setPlaybackError(true); }
      }
    }
  }

  async function togglePlayback() {
    switchSequence.current += 1;
    const audio = activeAudio.current;
    if (!audio || !pair) { setPlaybackError(true); return; }
    if (audio.paused && !playIntent.current) {
      const sequence = switchSequence.current;
      playIntent.current = true;
      try {
        await audio.play();
        if (sequence === switchSequence.current && activeAudio.current === audio) { setPlaying(true); setPlaybackError(false); }
        else if (!playIntent.current || activeAudio.current !== audio) audio.pause();
      }
      catch { if (sequence === switchSequence.current) { playIntent.current = false; setPlaying(false); setPlaybackError(true); } }
    } else {
      playIntent.current = false;
      audio.pause();
      setPlaying(false);
    }
  }

  function peaksTrack(label: string, peaks: number[] | undefined, active: boolean) {
    return <div className={`rounded-md border p-3 ${active ? "border-[var(--secondary)] bg-[color-mix(in_srgb,var(--secondary)_10%,var(--surface))]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      <div className="mb-2 flex items-center justify-between text-xs"><span>{label} waveform</span><span>{active ? "Active" : "Standby"}</span></div>
      <div className="flex h-12 items-center gap-[2px]" role="img" aria-label={`${label} waveform${active ? ", active side" : ""}${peaks ? "" : ", waveform detail unavailable"}`}>
        {peaks ? peaks.map((height, index) => <span key={index} className={`min-w-0 flex-1 rounded-full ${active ? "bg-[var(--secondary)]" : "bg-[var(--muted-foreground)] opacity-60"}`} style={{ height: `${height}%` }} aria-hidden="true" />) : <span className={`h-px w-full ${active ? "bg-[var(--secondary)]" : "bg-[var(--muted-foreground)]"}`} aria-hidden="true" />}
      </div>
    </div>;
  }

  if (loadError) return <div className="mt-5 rounded-md border border-amber-300/30 p-4" role="status">
    <p className="font-medium">Preview comparison data is unavailable.</p>
    <p className="mt-1 text-sm text-[var(--muted-foreground)]">The retained Before or After audio has expired or could not be opened. Create a new preview to compare this selected stream and range.</p>
  </div>;

  return <section className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--secondary)_40%,transparent)] bg-[var(--surface-elevated)] p-4" aria-labelledby="comparison-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--secondary)]">Preview comparison · experimental After</p><h3 id="comparison-title" className="mt-1 text-lg font-semibold">Before and After</h3></div>
      <p className="text-sm">Source bounds {job.range.startSeconds.toFixed(2)}–{job.range.endSeconds.toFixed(2)} sec</p>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">{peaksTrack("Before", beforePeaks, activeSide === "before")}{peaksTrack("After", afterPeaks, activeSide === "after")}</div>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Preview comparison mode">
      {(["before", "after", "ab"] as const).map((value) => <Button key={value} type="button" variant={mode === value ? "default" : "outline"} aria-pressed={mode === value} onClick={() => void switchMode(value)}>{value === "ab" ? "A/B" : value === "before" ? "Before" : "After"}</Button>)}
      {mode === "ab" && <Button type="button" variant="outline" onClick={() => void switchAbSide()} aria-label={`Switch A/B side; currently ${activeSide === "before" ? "Before" : "After"}`}>Switch A/B side</Button>}
    </div>
    <div className="mt-4">
      <label htmlFor="comparison-seek" className="sr-only">Seek within preview comparison</label>
      <input id="comparison-seek" type="range" min={0} max={duration || 1} step={0.01} value={Math.min(position, duration)} onChange={(event) => seek(Number(event.target.value))} className="w-full accent-[var(--secondary)]" aria-valuetext={`${formatTime(position)} of ${formatTime(duration)} preview`} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div><span>Preview time </span><strong>{formatTime(position)}</strong><span> / {formatTime(duration)}</span><span className="ml-2 text-[var(--muted-foreground)]">Before at {job.range.startSeconds.toFixed(2)} sec source start</span></div>
        <label className="flex min-h-11 items-center gap-2">Go to preview seconds<input aria-label="Go to preview seconds" type="number" min={0} max={duration} step={0.01} value={timeInput} onFocus={() => { timeInputEditing.current = true; }} onChange={(event) => setTimeInput(event.target.value)} onBlur={commitTimeInput} onKeyDown={(event) => { if (event.key === "Enter") { commitTimeInput(); event.currentTarget.blur(); } }} className="min-h-11 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2" /></label>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button type="button" onClick={() => void togglePlayback()} aria-label={playing ? "Pause preview comparison" : "Play preview comparison"} disabled={!pair}>{playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}{playing ? "Pause" : "Play"} {activeSide === "before" ? "Before" : "After"}</Button>
      <Button type="button" variant="outline" onClick={() => setMuted((value) => !value)} aria-pressed={muted} aria-label={muted ? "Unmute preview comparison" : "Mute preview comparison"}>{muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}{muted ? "Unmute" : "Mute"}</Button>
      <p className="text-xs text-[var(--muted-foreground)]">Keyboard: Tab to controls · arrows adjust the seek slider · A/B plays one side at a time.</p>
    </div>
    {playbackError && <p className="mt-3 text-sm text-amber-200" role="alert">Local preview playback was blocked. Use Play again or check this browser’s audio permissions.</p>}
    <p className="sr-only" role="status" aria-live="polite">{mode === "ab" ? `A/B mode, ${activeSide === "before" ? "Before" : "After"} active` : `${activeSide === "before" ? "Before" : "After"} selected`}</p>
    <audio ref={beforeRef} src={pair?.beforeUrl} preload="auto" muted={muted || activeSide !== "before"} className="sr-only" aria-label="Before preview audio" onTimeUpdate={(event) => { if (activeSide === "before") { const next = Math.min(duration, event.currentTarget.currentTime); setPosition(next); if (!timeInputEditing.current) setTimeInput(String(Math.round(next * 100) / 100)); if (afterRef.current) afterRef.current.currentTime = next; } }} onPlay={() => { if (activeAudio === beforeRef && playIntent.current) setPlaying(true); else beforeRef.current?.pause(); }} onPause={() => { if (activeAudio === beforeRef) setPlaying(false); }} onEnded={() => { if (activeAudio === beforeRef) { playIntent.current = false; setPlaying(false); seek(duration); } }} onError={() => { if (activeAudio === beforeRef) setPlaybackError(true); }} />
    <audio ref={afterRef} src={pair?.afterUrl} preload="auto" muted={muted || activeSide !== "after"} className="sr-only" aria-label="After preview audio" onTimeUpdate={(event) => { if (activeSide === "after") { const next = Math.min(duration, event.currentTarget.currentTime); setPosition(next); if (!timeInputEditing.current) setTimeInput(String(Math.round(next * 100) / 100)); if (beforeRef.current) beforeRef.current.currentTime = next; } }} onPlay={() => { if (activeAudio === afterRef && playIntent.current) setPlaying(true); else afterRef.current?.pause(); }} onPause={() => { if (activeAudio === afterRef) setPlaying(false); }} onEnded={() => { if (activeAudio === afterRef) { playIntent.current = false; setPlaying(false); seek(duration); } }} onError={() => { if (activeAudio === afterRef) setPlaybackError(true); }} />
  </section>;
}
