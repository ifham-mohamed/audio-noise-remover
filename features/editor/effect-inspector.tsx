"use client";

import { useMemo, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { defaultProcessingProfile, defaultProcessingStages, normalizeProcessingProfile, type CapabilityState, type EffectId, type ProcessingProfile, type ProcessingStage } from "@/shared/contracts/processing";
import { getStageDeclaration, processingProfileRegistry } from "@/shared/contracts/processing-profiles";

const readyCapability: CapabilityState = { status: "ready", cpuSafe: true };

function formatParameterValue(value: number, unit: string) {
  if (unit === "LUFS") return `${value} LUFS`;
  if (unit.startsWith("%")) return `${value}%`;
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function EffectInspector({ mediaRef, selectedAudioStreamId, capabilities = {}, onProfileChange }: { mediaRef: string; selectedAudioStreamId?: string; capabilities?: Partial<Record<EffectId, CapabilityState>>; onProfileChange?: (profile: ProcessingProfile) => void }) {
  const [profile, setProfile] = useState(() => {
    const initial = defaultProcessingProfile(mediaRef, selectedAudioStreamId);
    return { ...initial, stages: initial.stages.map((stage) => capabilities[stage.id as EffectId]?.status === "unavailable" ? { ...stage, enabled: false } : stage) };
  });
  const update = (next: ProcessingProfile) => {
    const normalized = normalizeProcessingProfile(next);
    setProfile(normalized);
    onProfileChange?.(normalized);
  };
  const enabledStages = useMemo(() => profile.stages.filter((stage) => stage.enabled), [profile.stages]);

  function toggle(stage: ProcessingStage) {
    const capability = capabilities[stage.id as EffectId] ?? readyCapability;
    if (!stage.enabled && capability.status === "unavailable") return;
    update({ ...profile, stages: profile.stages.map((candidate) => candidate.id === stage.id ? { ...candidate, enabled: !candidate.enabled } : candidate) });
  }

  function changeValue(stage: ProcessingStage, parameterId: string, rawValue: number) {
    const parameter = getStageDeclaration(profile.profileId, stage.id)?.parameters.find((item) => item.id === parameterId);
    if (!parameter) return;
    const value = Math.max(parameter.minimum, Math.min(parameter.maximum, rawValue));
    update({ ...profile, stages: profile.stages.map((candidate) => candidate.id === stage.id ? { ...candidate, parameters: { ...candidate.parameters, [parameterId]: value } } : candidate) });
  }

  function reset(stage: ProcessingStage) {
    const defaults = defaultProcessingStages.find((fallback) => fallback.id === stage.id);
    if (defaults) update({ ...profile, stages: profile.stages.map((candidate) => candidate.id === stage.id ? defaults : candidate) });
  }

  return <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5" aria-labelledby="effects-title">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Speech profile</p><h2 id="effects-title" className="mt-1 text-xl font-semibold">Tune the enhancement stages</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">Each stage stays independent, so you can decide exactly what will run on this local media.</p></div><Badge><SlidersHorizontal className="mr-1 size-3.5" aria-hidden="true" />Draft profile</Badge></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Registered processing profiles">{processingProfileRegistry.filter((declaration) => declaration.id !== "speech").map((declaration) => <article key={declaration.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{declaration.label}</h3><Badge>Unavailable</Badge></div><p className="mt-2 text-sm leading-5 text-[var(--muted-foreground)]">{declaration.execution.reason}</p><ul className="mt-3 space-y-2 text-sm">{declaration.stages.map((stage) => <li key={stage.id}><span className="font-medium">{stage.label}</span><span className="block text-[var(--muted-foreground)]">{stage.description}</span></li>)}</ul></article>)}</div>
    <div className="mt-6 space-y-3">{profile.stages.map((stage, index) => <EffectCard key={stage.id} stage={stage} index={index} capability={capabilities[stage.id as EffectId] ?? readyCapability} onToggle={() => toggle(stage)} onChange={(parameterId, value) => changeValue(stage, parameterId, value)} onReset={() => reset(stage)} />)}</div>
    <div className="mt-6 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--primary)_28%,transparent)] bg-[var(--surface-elevated)] p-4"><p className="text-sm font-medium">What will run</p><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{enabledStages.length ? enabledStages.map((stage, index) => {
      const declaration = getStageDeclaration(profile.profileId, stage.id);
      const values = declaration?.parameters.map((parameter) => formatParameterValue(stage.parameters[parameter.id] ?? parameter.defaultValue, parameter.unit)).join(", ") ?? "";
      return `${index + 1}. ${declaration?.label ?? stage.id}${values ? ` (${values})` : ""}`;
    }).join(" · ") : "No enhancement stages selected. Your source remains unchanged."}</p></div>
  </section>;
}

function EffectCard({ stage, index, capability, onToggle, onChange, onReset }: { stage: ProcessingStage; index: number; capability: CapabilityState; onToggle: () => void; onChange: (parameterId: string, value: number) => void; onReset: () => void }) {
  const declaration = getStageDeclaration("speech", stage.id);
  const title = declaration?.label ?? stage.id;
  const description = declaration?.description ?? "Registered speech processing stage.";
  const unavailable = capability.status === "unavailable";
  return <article className={`rounded-[var(--radius-lg)] border p-4 transition-colors ${stage.enabled ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface-elevated)] opacity-80"}`}>
    <div className="flex items-start gap-3"><div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--muted-foreground)]">{index + 1}</div><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{title}</h3><p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p></div><button type="button" role="switch" aria-checked={stage.enabled} aria-label={`${title} enabled`} disabled={unavailable} onClick={onToggle} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"><span className={`relative h-6 w-11 rounded-full ${stage.enabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${stage.enabled ? "translate-x-6" : "translate-x-1"}`} /></span><span>{stage.enabled ? "On" : "Off"}</span></button></div>
      <div className="mt-3 flex flex-wrap items-end gap-4">{declaration?.parameters.map((parameter) => {
        const inputId = `effect-${stage.id}-${parameter.id}`;
        const value = stage.parameters[parameter.id] ?? parameter.defaultValue;
        const valueText = formatParameterValue(value, parameter.unit);
        return <div key={parameter.id} className="min-w-56 flex-1"><label htmlFor={inputId} className="text-xs font-medium text-[var(--muted-foreground)]">{title} · {parameter.unit}</label><input id={inputId} type="range" min={parameter.minimum} max={parameter.maximum} step={parameter.step} value={value} disabled={!stage.enabled || unavailable} onChange={(event) => onChange(parameter.id, Number(event.target.value))} className="mt-2 w-full accent-[var(--primary)] disabled:opacity-50" aria-valuetext={valueText} /><output htmlFor={inputId} className="mt-1 block text-sm font-medium">{valueText}</output></div>;
      })}<Button type="button" variant="ghost" size="sm" onClick={onReset}><RotateCcw className="size-4" aria-hidden="true" />Reset</Button></div>
      {capability.status !== "ready" && <p className="mt-3 text-xs leading-5 text-amber-200" role="status">{capability.message ?? (capability.status === "unavailable" ? "This stage needs a local speech capability before it can be enabled." : "CPU-safe fallback is active for this stage.")}</p>}
    </div></div>
  </article>;
}
