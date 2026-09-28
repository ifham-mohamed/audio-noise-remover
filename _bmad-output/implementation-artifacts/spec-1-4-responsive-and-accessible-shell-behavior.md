---
title: 'Story 1.4 — Responsive and Accessible Shell Behavior'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1b76360bd3a6cb392a7c75bf9cb9aa8afd24475c'
context:
  - 'C:/projects/ai-noice-removal/AGENTS.md'
  - 'C:/projects/ai-noice-removal/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The shell has the basic desktop rail and mobile Sheet, but focus movement, announcements, touch sizing, and intermediate breakpoints are not yet guaranteed for keyboard, screen-reader, touch, zoom, and reduced-motion users.

**Approach:** Harden the shared shell and settings layout around explicit responsive breakpoints and semantic navigation behavior. Route changes will move focus to the new surface heading and announce the current surface, while Sheet/popover interactions retain accessible close and focus-return behavior.

## Boundaries & Constraints

**Always:** Keep desktop navigation visible at widths of at least 1024px; use the Sheet navigation below 1024px; keep all essential actions reachable without hover; preserve the local trust badge and active-job access at every breakpoint; use semantic landmarks, visible focus, 44px minimum touch targets, color-independent status, reduced-motion-safe transitions, zoom-safe text/layout, and polite surface-change announcements; return focus to the invoking control when a Sheet or dialog closes.

**Never:** Add cloud/account language, hide navigation or active jobs behind hover, trap focus outside an open dialog/Sheet, change processing/job ownership, replace the existing local-only trust boundary, or solve responsive behavior with a second independent shell implementation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DESKTOP_VIEW | Viewport is at least 1024px | Desktop rail, workspace, active surface, trust badge, and active-job region are visible | No essential action depends on hover |
| COMPACT_VIEW | Viewport is below 1024px | Navigation is opened through the accessible Sheet; current surface remains identifiable and reachable | Sheet has an accessible name, close control, Escape handling, and trigger focus restoration |
| ROUTE_CHANGE | User activates New enhancement, History, or Settings | Main heading receives focus and the new surface is announced through semantic live-region behavior | If the heading is unavailable, focus the main landmark without throwing |
| KEYBOARD_FLOW | User tabs through shell and opens a Sheet/popover/dialog | Order follows visual reading order, focus is visible, and Escape closes only the topmost layer | Focus returns to the invoking control after close |
| TOUCH_ZOOM | Narrow viewport, touch input, or enlarged text | Controls remain at least 44px, labels do not clip, and content does not require inaccessible horizontal scrolling | Layout stacks or allows safe scrolling without hiding actions |
| REDUCED_MOTION | System or saved reduced-motion preference is active | Shell transitions and Sheet feedback become static or near-instant while state text remains available | Never rely on animation to communicate state |

</frozen-after-approval>

## Code Map

- `components/app-shell.tsx` -- shared rail, mobile Sheet, active-job region, trust badge, route state, and shell focus behavior.
- `components/ui/sheet.tsx` -- Radix Sheet primitives; preserve built-in focus trapping/restoration and harden close target sizing/semantics.
- `components/ui/tooltip.tsx` -- trust-badge popover behavior; ensure it remains keyboard reachable and non-essential to navigation.
- `components/settings-panel.tsx` -- settings card breakpoint and touch/layout consumer.
- `app/settings/page.tsx` -- settings/diagnostics composition and route heading.
- `app/globals.css` -- focus, reduced-motion, overflow, and responsive support tokens.
- `tests/app-shell.test.tsx` -- shell navigation, active job, trust state, and accessibility regression coverage.
- `tests/responsive-shell.test.tsx` -- focused route-change announcement, focus fallback, and responsive contract coverage.

## Tasks & Acceptance

**Execution:**
- [x] `components/app-shell.tsx` -- add route-change focus to the destination heading/main fallback and a polite surface announcement -- make navigation changes usable by keyboard and screen reader.
- [x] `components/app-shell.tsx` and `components/ui/sheet.tsx` -- harden touch target sizing, accessible names, close behavior, and active-job/trust access at compact widths -- preserve one shared shell across breakpoints.
- [x] `components/settings-panel.tsx` and `app/globals.css` -- align settings cards and shell spacing with the 1024/768 breakpoints and zoom/reduced-motion requirements -- prevent clipping and hover-only behavior.
- [x] `tests/app-shell.test.tsx` and `tests/responsive-shell.test.tsx` -- cover the matrix and acceptance behaviors -- keep responsive and accessibility guarantees executable.

**Acceptance Criteria:**
- Given the viewport is at least 1024px wide, when the shell renders, then the desktop navigation rail and workspace layout are present.
- Given the viewport is below 1024px, when the shell renders, then navigation is available through the accessible Sheet and the current surface, trust badge, and active-job access remain reachable without hover.
- Given a keyboard user activates navigation, when the destination renders, then focus moves to the destination heading or main fallback, visible focus is retained, and the new surface is announced.
- Given a Sheet, popover, or dialog is open, when Escape is pressed, then only the topmost layer closes and focus returns to its invoking control.
- Given touch input, browser zoom, large text, or reduced motion, when the shell and settings render, then controls remain usable at 44px minimum, text/actions are not clipped, and state communication remains available without animation or color alone.

## Implementation Notes

- Added route-aware focus management with a heading-first fallback to the main landmark and a polite current-surface announcement.
- Kept one navigation data source across the desktop rail and controlled mobile Sheet; mobile navigation closes on selection and Radix restores trigger focus on Escape.
- Added explicit Radix Sheet title/description semantics and 44px close/toggle targets; aligned settings cards to the tablet breakpoint.
- Verified 26 tests, TypeScript, ESLint, and production build successfully.

## Spec Change Log

## Review Triage Log

## Design Notes

Use one shared semantic shell: a desktop `aside` at `lg`, a Radix Sheet below it, and the same navigation data in both. The main heading is the focus target because it confirms the new surface without unexpectedly activating a control. Keep the active-job card and trust badge in the reading order after navigation, and use a visually hidden polite live region for concise route announcements rather than duplicating visible headings.

## Verification

**Commands:**
- `npm test -- --run` -- expected: all existing and Story 1.4 tests pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run lint` -- expected: no lint errors.
- `npm run build` -- expected: production build succeeds.

**Manual checks:**
- Inspect the shell at desktop, tablet, mobile, 200% zoom, keyboard-only navigation, screen-reader landmarks, open/close Sheet focus, and reduced-motion settings; confirm no required action is hover-only or clipped.
