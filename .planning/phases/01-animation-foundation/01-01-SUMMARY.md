---
phase: 01-animation-foundation
plan: 01
subsystem: ui
tags: [gsap, scrolltrigger, lenis, smooth-scroll, animation]

# Dependency graph
requires: []
provides:
  - "Zentrale GSAP Plugin-Registrierung (lib/gsap.ts) mit ScrollTrigger + useGSAP"
  - "SmoothScrollProvider mit Lenis-GSAP Ticker Sync (Desktop-only)"
  - "Layout-Integration: SmoothScrollProvider um main-Content"
affects: [01-02, 02-scroll-animations, 03-page-transitions]

# Tech tracking
tech-stack:
  added: [gsap 3.14.2, "@gsap/react 2.1.2", lenis 1.3.19]
  patterns: [central-gsap-registration, desktop-only-lenis, gsap-ticker-sync]

key-files:
  created:
    - lib/gsap.ts
    - components/providers/smooth-scroll-provider.tsx
  modified:
    - app/[locale]/layout.tsx
    - app/globals.css
    - package.json

key-decisions:
  - "Eigener Lenis Provider statt lenis/react ReactLenis -- mehr Kontrolle ueber Desktop-only Guard"
  - "autoRaf: false + GSAP Ticker -- ein einziger RAF-Loop fuer Lenis und alle GSAP-Animationen"
  - "scroll-behavior: smooth entfernt statt conditional -- Mobile braucht es nicht, Desktop hat Lenis"

patterns-established:
  - "Central GSAP import: Alle GSAP-Imports nur aus @/lib/gsap, nie direkt aus gsap"
  - "Lenis Desktop-only: matchMedia(min-width:768px) + Touch-Detection Guard"
  - "GSAP-Lenis Sync: autoRaf false, ticker.add, lagSmoothing(0), lenis.on scroll ScrollTrigger.update"

requirements-completed: [ANIM-02, ANIM-05]

# Metrics
duration: 2min
completed: 2026-03-19
---

# Phase 1 Plan 1: GSAP + Lenis Infrastruktur Summary

**GSAP mit zentraler Plugin-Registrierung und Lenis Smooth Scroll Provider mit Desktop-only Guard und GSAP-Ticker-Sync**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-19T10:56:13Z
- **Completed:** 2026-03-19T10:58:04Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GSAP, @gsap/react und Lenis installiert mit zentraler Plugin-Registrierung in lib/gsap.ts
- SmoothScrollProvider mit Desktop-only Guard (matchMedia + Touch-Detection) und GSAP-Ticker-Sync
- Layout-Integration: SmoothScrollProvider um main-Content, Navigation und Footer ausserhalb
- scroll-behavior: smooth aus CSS entfernt (Lenis-Konflikt vermieden)

## Task Commits

Each task was committed atomically:

1. **Task 1: GSAP + Lenis installieren und zentrale Registrierung erstellen** - `bdf0752` (feat)
2. **Task 2: SmoothScrollProvider erstellen, ins Layout integrieren, scroll-behavior entfernen** - `c74ea80` (feat)

## Files Created/Modified
- `lib/gsap.ts` - Zentrale GSAP Plugin-Registrierung mit ScrollTrigger + useGSAP Re-Exports
- `components/providers/smooth-scroll-provider.tsx` - Lenis Provider mit Desktop-only Guard und GSAP-Ticker-Sync
- `app/[locale]/layout.tsx` - SmoothScrollProvider um main-Content gewrappt
- `app/globals.css` - scroll-behavior: smooth entfernt
- `package.json` - gsap, @gsap/react, lenis als Dependencies

## Decisions Made
- Eigener Lenis Provider statt lenis/react ReactLenis -- mehr Kontrolle ueber Desktop-only Guard Logik
- autoRaf: false + GSAP Ticker als einziger RAF-Loop -- verhindert doppelte Animation Frames
- scroll-behavior: smooth komplett entfernt -- Mobile braucht es nicht, Desktop hat Lenis

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GSAP und Lenis Infrastruktur steht -- bereit fuer useScrollReveal Hook und prefers-reduced-motion Support in Plan 01-02
- Alle zukuenftigen GSAP-Imports muessen aus @/lib/gsap kommen

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 01-animation-foundation*
*Completed: 2026-03-19*
