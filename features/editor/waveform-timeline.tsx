"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreviewRange } from "@/shared/contracts/preview";

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
export function formatTime(value: number) { const safe = Number.isFinite(value) && value >= 0 ? value : 0; const minutes = Math.floor(safe / 60); const seconds = Math.floor(safe % 60); return `${minutes}:${seconds.toString().padStart(2, "0")}`; }

type WaveformTimelineProps = { file?: File; durationSeconds: number; mediaKind?: "audio" | "video"; seekIntervalSeconds?: number; onCurrentTimeChange?: (seconds: number) => void; previewRange?: PreviewRange; previewStale?: boolean };

export function WaveformTimeline({ file, durationSeconds, mediaKind = "audio", seekIntervalSeconds = 5, onCurrentTimeChange, previewRange, previewStale = false }: WaveformTimelineProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [duration, setDuration] = useState(Math.max(0, durationSeconds));
  const [currentTime, setCurrentTime] = useState(0);
  const [timeInput, setTimeInput] = useState("0");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const waveformBars = useMemo(() => Array.from({ length: 48 }, (_, index) => 24 + ((index * 17) % 58)), []);
  const hasDuration = duration > 0;

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") { setSourceUrl(undefined); return; }
    const url = URL.createObjectURL(file); setSourceUrl(url); setPlaybackError(false);
    return () => { URL.revokeObjectURL(url); setSourceUrl(undefined); };
  }, [file]);

  useEffect(() => { setDuration(Math.max(0, durationSeconds)); setCurrentTime(0); setTimeInput("0"); setIsPlaying(false); onCurrentTimeChange?.(0); }, [durationSeconds, file, onCurrentTimeChange]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReducedMotion(query.matches); update(); query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  function seek(value: number) {
    if (!hasDuration || !Number.isFinite(value)) return;
    const next = clamp(value, 0, duration); setCurrentTime(next); setTimeInput(String(Math.round(next * 100) / 100)); onCurrentTimeChange?.(next); if (audioRef.current) audioRef.current.currentTime = next;
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !sourceUrl) { setPlaybackError(true); return; }
    if (audio.paused) { try { await audio.play(); setIsPlaying(true); setPlaybackError(false); } catch { setPlaybackError(true); setIsPlaying(false); } } else { audio.pause(); setIsPlaying(false); }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
    if (event.key === " ") { event.preventDefault(); void togglePlayback(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); seek(currentTime - seekIntervalSeconds); }
    if (event.key === "ArrowRight") { event.preventDefault(); seek(currentTime + seekIntervalSeconds); }
  }

  function handleTimeInput(value: string) { setTimeInput(value); if (value.trim() === "") return; const parsed = Number(value); if (Number.isFinite(parsed)) seek(parsed); }

  return <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5" aria-labelledby="timeline-title" onKeyDown={handleKeyDown} tabIndex={0} data-reduced-motion={reducedMotion ? "true" : "false"}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Source {mediaKind === "video" ? "audio" : "track"}</p><h2 id="timeline-title" className="mt-1 text-xl font-semibold">Audio timeline</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Listen locally and choose a meaningful moment for the next preview.</p></div><span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)]">{previewRange ? `Last preview bounds${previewStale ? " · older settings" : ""}: ${formatTime(previewRange.startSeconds)} – ${formatTime(previewRange.endSeconds)}` : `No preview range yet · media ${formatTime(duration)}`}</span></div>
    <div className="mt-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]"><span>0:00</span><span>Time ruler</span><span>{formatTime(duration)}</span></div><div className="relative mt-3 h-24 overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-elevated)] px-2" aria-label="Waveform overview"><div className="flex h-full items-center gap-1">{waveformBars.map((height, index) => <span key={index} className="min-w-1 flex-1 rounded-full bg-[var(--secondary)]" style={{ height: `${height}%` }} aria-hidden="true" />)}</div>{previewRange && hasDuration && <div className="pointer-events-none absolute inset-y-1 rounded bg-[color-mix(in_srgb,var(--secondary)_18%,transparent)] ring-1 ring-inset ring-[var(--secondary)]" style={{ left: `${(previewRange.startSeconds / duration) * 100}%`, width: `${((previewRange.endSeconds - previewRange.startSeconds) / duration) * 100}%` }} aria-hidden="true" /> }<div className="pointer-events-none absolute inset-y-2 w-0.5 bg-[var(--primary)]" style={{ left: `${hasDuration ? (currentTime / duration) * 100 : 0}%` }} aria-hidden="true" /></div><p className="mt-2 text-xs text-[var(--muted-foreground)]" aria-live="polite">{previewRange ? `Last preview range: ${previewRange.startSeconds.toFixed(2)} to ${previewRange.endSeconds.toFixed(2)} seconds${previewStale ? ". The playhead or profile has changed." : ". The shaded area shows the selected sample."}` : "Preview sample bounds will appear here after you create a preview request."}</p><label htmlFor="timeline-seek" className="sr-only">Seek through audio</label><input id="timeline-seek" type="range" min={0} max={duration || 1} step={0.01} value={hasDuration ? currentTime : 0} disabled={!hasDuration} onChange={(event) => seek(Number(event.target.value))} className="mt-3 w-full accent-[var(--primary)] disabled:opacity-50" aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><div><span className="text-[var(--muted-foreground)]">Current time </span><strong>{formatTime(currentTime)}</strong><span className="text-[var(--muted-foreground)]"> / {formatTime(duration)}</span></div><div className="flex items-center gap-2"><label htmlFor="timeline-time" className="text-xs text-[var(--muted-foreground)]">Go to seconds</label><input id="timeline-time" type="number" min={0} max={duration} step={0.01} value={timeInput} disabled={!hasDuration} onChange={(event) => handleTimeInput(event.target.value)} onBlur={() => setTimeInput(String(Math.round(currentTime * 100) / 100))} className="min-h-11 w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50" /></div></div></div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" onClick={() => void togglePlayback()} disabled={!sourceUrl && !file} aria-label={isPlaying ? "Pause local audio" : "Play local audio"}>{isPlaying ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}{isPlaying ? "Pause" : "Play"}</Button><Button type="button" variant="outline" onClick={() => { const next = !isMuted; setIsMuted(next); if (audioRef.current) audioRef.current.muted = next; }} aria-label={isMuted ? "Unmute local audio" : "Mute local audio"}>{isMuted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}{isMuted ? "Unmute" : "Mute"}</Button><p className="text-xs text-[var(--muted-foreground)]">Keyboard: Space play/pause · Arrow keys seek {seekIntervalSeconds}s</p></div>
    {!hasDuration && <p className="mt-4 text-sm text-[var(--muted-foreground)]" role="status">A usable duration was not reported, so seeking is unavailable.</p>}{playbackError && <p className="mt-4 text-sm text-amber-200" role="status">Local playback is unavailable for this browser probe. The time controls remain available.</p>}
    <audio ref={audioRef} src={sourceUrl} preload="metadata" muted={isMuted} className="sr-only" onLoadedMetadata={(event) => { const next = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : duration; setDuration(Math.max(0, next)); }} onTimeUpdate={(event) => { const next = clamp(event.currentTarget.currentTime, 0, duration || event.currentTarget.duration || 0); setCurrentTime(next); setTimeInput(String(Math.round(next * 100) / 100)); onCurrentTimeChange?.(next); }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => { setIsPlaying(false); seek(duration); }} onError={() => setPlaybackError(true)} aria-label="Local source audio" />
  </section>;
}
