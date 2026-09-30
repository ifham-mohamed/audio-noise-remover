const cleanupLeaseMs = 120_000;
type CleanupPlan = { scope: string; plannedPreviewIds: string[]; plannedOutputIds: string[]; plannedSourceRefs: string[]; plannedFinalHistoryIds: string[]; plannedPreviewHistoryIds: string[] };
let currentLease: { token: string; expiresAt: number; plan: CleanupPlan } | undefined;

function activeLease() {
  if (currentLease && currentLease.expiresAt <= Date.now()) currentLease = undefined;
  return currentLease;
}

function normalized(plan: CleanupPlan) {
  return JSON.stringify({ scope: plan.scope, plannedPreviewIds: [...plan.plannedPreviewIds].sort(), plannedOutputIds: [...plan.plannedOutputIds].sort(), plannedSourceRefs: [...plan.plannedSourceRefs].sort(), plannedFinalHistoryIds: [...plan.plannedFinalHistoryIds].sort(), plannedPreviewHistoryIds: [...plan.plannedPreviewHistoryIds].sort() });
}

export function beginLocalCleanup(plan: CleanupPlan) {
  if (activeLease()) throw new Error("Another local cleanup is already in progress.");
  const lease = { token: crypto.randomUUID(), expiresAt: Date.now() + cleanupLeaseMs, plan: JSON.parse(normalized(plan)) as CleanupPlan };
  currentLease = lease;
  return lease.token;
}

export function finishLocalCleanup(token: string) {
  assertLocalCleanupToken(token);
  currentLease = undefined;
}

export function assertLocalCleanupToken(token: string, plan?: CleanupPlan) {
  const lease = activeLease();
  if (!lease || lease.token !== token) throw new Error("The local cleanup session expired. Check cleanup status and retry if needed.");
  if (plan && normalized(lease.plan) !== normalized(plan)) throw new Error("Cleanup results do not match the prepared local artifact list.");
}

export function cancelLocalCleanup(token: string) {
  if (activeLease()?.token === token) currentLease = undefined;
}

export function assertLocalCleanupInactive() {
  if (activeLease()) throw new Error("Local cleanup is in progress. Wait for it to finish before starting another job.");
}
