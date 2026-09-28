# Reviewer Gate — Adversarial Seam Review

## Verdict

Pass with one accepted boundary: the job coordinator must remain the sole owner of job state and output finalization.

## Attack cases

- UI and worker cannot disagree about job terminal state because AD-3 and AD-7 require typed state and event contracts.
- FFmpeg and model adapters cannot silently choose incompatible audio formats because AD-5 requires canonical PCM at the media boundary and AD-6 makes preprocessing adapter-owned.
- Retry cannot overwrite the original or a successful prior result because AD-2 and AD-9 require a new attempt and atomic output finalization.
- Platform-specific acceleration cannot make CPU-only machines unusable because AD-6 and AD-11 require CPU fallback and capability detection.
- Future music support cannot force speech UI changes into the core job API because AD-4, AD-6, and AD-12 place variation in profiles and adapters.

## Required implementation discipline

Keep the coordinator, pipeline profile, and output finalizer as explicit modules. Do not allow UI event handlers or adapters to mutate job state directly.
