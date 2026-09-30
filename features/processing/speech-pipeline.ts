import { enhanceWithDpdfnet } from "@/features/preview/dpdfnet-adapter";
import { applyVoiceClarity, VOICE_CLARITY_VERSION } from "@/features/processing/voice-clarity";
import { applyLoudnessNormalization } from "@/features/processing/loudness-normalization";
import { applyEchoReverbReduction } from "@/features/processing/echo-reverb-reduction";
import { parseEnabledSpeechStages, type ProcessingStage } from "@/shared/contracts/processing";
import type { SpeechStageMetrics } from "@/shared/contracts/final-output";

export const speechStagePhases: Record<string, string> = { "noise-removal": "Removing noise experimentally", "voice-clarity": "Applying voice clarity", "loudness-normalization": "Normalizing speech loudness", "echo-reverb-reduction": "Reducing late reflections experimentally" };

/** Same explicit stage list for previews and finals; never silently omit an enabled stage. */
export async function runSpeechPipeline(input: Float32Array, stages: ProcessingStage[], options: { signal?: AbortSignal; onProgress?: (stageId: string, fraction: number) => void } = {}): Promise<{ samples: Float32Array; metrics: SpeechStageMetrics }> {
  const parsed = parseEnabledSpeechStages(stages);
  if (!parsed.success) throw new Error(parsed.message);
  let samples = input;
  const metrics: SpeechStageMetrics = {};
  for (const [index, stage] of parsed.data.entries()) {
    options.signal?.throwIfAborted();
    let reportedFraction = -1;
    const progress = (fraction: number) => {
      options.signal?.throwIfAborted();
      if (!Number.isFinite(fraction)) return;
      const normalized = Math.max(reportedFraction, Math.max(0, Math.min(1, fraction)));
      // DSP checkpoints may run thousands of times. Bound persisted status traffic
      // without skipping stage boundaries or allowing floating-point regressions.
      if (reportedFraction >= 0 && normalized - reportedFraction < 0.01 && !(normalized === 1 && reportedFraction < 1)) return;
      reportedFraction = normalized;
      options.onProgress?.(stage.id, (index + normalized) / parsed.data.length);
    };
    progress(0);
    if (stage.id === "noise-removal") {
      samples = await enhanceWithDpdfnet(samples, stage.parameters.intensity, () => options.signal?.aborted ?? false, progress);
      metrics[stage.id] = { version: "dpdfnet2-c7ac7b249ff5e17fa606794dc4f68ed9a544834f", intensity: stage.parameters.intensity, experimental: true };
    } else if (stage.id === "voice-clarity") {
      samples = applyVoiceClarity(samples, 48_000, stage.parameters.intensity);
      metrics[stage.id] = { version: VOICE_CLARITY_VERSION, intensity: stage.parameters.intensity };
    } else if (stage.id === "loudness-normalization") {
      const result = applyLoudnessNormalization(samples, 48_000, stage.parameters.targetLufs, { signal: options.signal, onProgress: progress });
      samples = result.samples;
      metrics[stage.id] = { version: result.metrics.version, targetLufs: result.metrics.targetLufs, achievedLufs: result.metrics.achievedLufs, appliedGainDb: result.metrics.appliedGainDb, headroomLimited: result.metrics.headroomLimited, targetUnmet: result.metrics.targetUnmet, targetUnmetReason: result.metrics.targetUnmetReason, estimatedTruePeakDbtp: result.metrics.output.estimatedTruePeakDbtp };
    } else if (stage.id === "echo-reverb-reduction") {
      const result = await applyEchoReverbReduction(samples, 48_000, { intensity: stage.parameters.intensity, signal: options.signal, onProgress: progress });
      samples = result.samples;
      metrics[stage.id] = { version: result.metrics.algorithmVersion, meanSpectralGain: result.metrics.meanSpectralGain, headroomScale: result.metrics.headroomScale, experimental: true };
    }
    options.signal?.throwIfAborted();
    progress(1);
  }
  return { samples, metrics };
}
