# Manual verification record

Updated 2026-10-01. Story 3.2 is **done** for its approved experimental scope. In response to a question explicitly naming progress, ready, cancelling, cancelled, and retry, the user reported: `yes all worked fine , Version154.0.4258.37(Official build)(64-bit)`. This direct report is accepted as an operational pass for all five Narrator checks. Exact spoken phrases were not transcribed; no independently observed speech or reviewer-run manual session is claimed. The earlier user-reported failure walkthrough remains a separate record.

For each run record date, observer, OS/build, browser/version, screen reader/version (Narrator: Windows build), fixture identifier, model/runtime version, enabled effects, exact speech heard, focus behavior, and pass/issue/not tested. Use a local speech fixture and the installed pinned experimental model with noise removal enabled and unsupported effects disabled. Run success and cancellation separately; cancel during inference, then retry from the terminal cancelled or failed attempt. An unavailable or missed state is **not tested**, never a pass.

| Windows / Edge / Narrator scenario | Check to observe | Actual speech / evidence | Result |
| --- | --- | --- | --- |
| Success: progress | Phase and available progress are spoken; elapsed time and keyboard focus remain usable | Five-state user confirmation above; exact phrase not transcribed | Pass — user reported |
| Success: preview ready | Experimental readiness is spoken; validated Before/After preview is usable and labeled preview | Five-state user confirmation above; exact phrase not transcribed | Pass — user reported |
| Cancellation: cancelling | Cancellation request is distinguished from completed cancellation | Five-state user confirmation above; exact phrase not transcribed | Pass — user reported |
| Cancellation: cancelled | Terminal cancellation is spoken after worker cleanup; no enhanced artifact is available | Five-state user confirmation above; exact phrase not transcribed | Pass — user reported |
| Retry | Retry control name is spoken and keyboard usable; new linked attempt starts; old terminal attempt remains | Five-state user confirmation above; exact phrase not transcribed | Pass — user reported |
| Failure | Safe failure and recovery actions are spoken | Earlier user report only; versions/words absent | Reported working; incomplete record |

Report recorded 2026-10-01; observer/report source: the user. User-supplied Edge version: `154.0.4258.37 (Official build) (64-bit)`. Separately collected current-device host metadata from read-only `Get-CimInstance Win32_OperatingSystem`: Caption `Microsoft Windows 11 Pro`, Version `10.0.26100`, BuildNumber `26100`. The host metadata was not supplied by the user and does not independently establish the manual-run environment. Narrator standalone version, fixture, exact run time, and detailed focus/speech notes were not supplied.

| Physical-platform follow-up | Required observations | Environment / evidence | Result |
| --- | --- | --- | --- |
| macOS / supported browser / VoiceOver | Local runtime readiness and CPU processing; progress, ready, cancelling, cancelled, retry; keyboard/focus; save/download fallback; linked cleanup protects originals | Not recorded | Not tested |
| Linux / supported browser / available reader (record which) | Same lifecycle, CPU processing, keyboard/focus, save/download fallback, and linked cleanup checks | Not recorded | Not tested |

Also record reduced-motion and visible-focus/color-independent status checks per tested environment. Browser emulation and injected platform tests do not substitute for physical-platform or spoken-reader evidence. The direct Windows/Narrator report closes Story 3.2's experimental manual acceptance work; broader macOS/Linux follow-ups stay separately tracked and not tested. Record issues and reruns without replacing earlier observations with expected wording. Production model qualification is unchanged.

Story acceptance source: [Story 3.2](../_bmad-output/implementation-artifacts/spec-3-2-show-preview-progress-cancellation-and-failure.md).
