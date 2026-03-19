# Research Summary: Now. Website Premium Visual Upgrade

**Domain:** Animation/interaction layer fuer bestehende Artist-Website
**Researched:** 2026-03-19
**Overall confidence:** HIGH

## Executive Summary

Der Standard-Stack fuer premium cinematische Animationen auf Next.js-Websites in 2025/2026 ist klar: **GSAP + ScrollTrigger + Lenis**. Diese Kombination wird von der Mehrheit der Awwwards-praemierten Websites eingesetzt und ist der De-facto-Standard fuer scroll-basierte, timeline-choreografierte Animationen.

GSAP ist seit April 2025 vollstaendig kostenlos (inkl. aller Premium-Plugins wie SplitText, MorphSVG etc.), nachdem Webflow GreenSock uebernommen hat. Das eliminiert den frueheren Hauptvorteil von Motion (Framer Motion): die freie Lizenz. GSAP's imperative Timeline-API ist fuer cinematische, scroll-getriebene Animationen besser geeignet als Motions deklarativer Ansatz, der eher fuer UI-State-Transitions optimiert ist.

Lenis (von Darkroom Engineering) ist der Standard fuer Smooth Scroll -- leichtgewichtig, accessible, und perfekt integrierbar mit GSAP's ScrollTrigger. Die Kombination GSAP + Lenis deckt alles ab: scroll-triggered reveals, parallax, text-animationen, pinned sections, staggered grids.

Fuer einfache Hover-States und Micro-Interactions reichen CSS Transitions und Tailwind -- kein zusaetzliches Library noetig. CSS scroll-driven animations (scroll-timeline) sind eine Option fuer sehr einfache Parallax-Effekte und laufen off-thread, aber der Browser-Support (kein Firefox) macht GSAP zur sichereren Wahl. Next.js View Transitions API ist experimental und noch nicht produktionsreif.

## Key Findings

**Stack:** GSAP 3.14.2 + @gsap/react 2.1.2 + Lenis 1.3.19 -- zwei npm-Packages, ~50KB gzip total
**Architecture:** Animation als separate Layer -- Client Component Wrapper um bestehende Server Components. useGSAP() Hook fuer automatisches Cleanup. Lenis Provider im Layout.
**Critical pitfall:** ScrollTrigger Memory Leaks bei Route-Wechsel -- useGSAP() statt useEffect verhindert das

## Implications for Roadmap

Basierend auf der Research, empfohlene Phase-Struktur:

1. **Foundation Setup** - GSAP + Lenis installieren, lib/gsap.ts, SmoothScrollProvider, useScrollReveal Hook
   - Addresses: Grundlage fuer alle weiteren Animationen
   - Avoids: Memory Leak Pitfall (useGSAP von Anfang an), Sync-Probleme (korrekte Lenis-Integration)

2. **Scroll Reveals + Typografie** - Section-Reveals auf allen Seiten, Typografie ueberarbeiten
   - Addresses: Groesster visueller Impact, Table-Stakes Features
   - Avoids: Content-unsichtbar Pitfall (gsap.from Pattern), Animation-Overload (wenige konsistente Typen)

3. **Tiefe und Bewegung** - Parallax, Text Reveals, Staggered Grids
   - Addresses: Differentiator-Features die von "professionell" zu "wow" heben
   - Avoids: Mobile Performance Pitfall (matchMedia Gate), SplitText Resize-Bug (autoSplit)

4. **Polish und Delight** - Magnetic Buttons, Custom Cursor, Section-Uebergaenge
   - Addresses: Awwwards-Level Details
   - Avoids: Animation-Overload (nur wenn vorherige Phasen gut funktionieren)

**Phase ordering rationale:**
- Setup zuerst weil alles darauf aufbaut (GSAP + Lenis muss funktionieren bevor Animationen moeglich sind)
- Scroll Reveals vor Parallax weil sie einfacher sind und das Pattern beweisen
- Polish zuletzt weil es optional ist und die Seite ohne es bereits premium wirkt

**Research flags for phases:**
- Phase 1: Standard-Patterns, braucht keine weitere Research. Gut dokumentiert.
- Phase 3 (Pinned Sections): Braucht moeglicherweise tiefere Research wenn Cinematische Pinned Sections gewuenscht sind
- Phase 4 (Page Transitions): View Transitions API Status muss zum Zeitpunkt der Implementierung nochmal geprueft werden

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (GSAP + Lenis) | HIGH | Versionen via npm verifiziert. GSAP-Lizenz via offizielle Quellen bestaetigt. Community-Konsens klar. |
| Features | MEDIUM-HIGH | Table Stakes aus Awwwards-Analyse abgeleitet. Complexity-Schaetzungen basieren auf Erfahrung, nicht auf Benchmarks. |
| Architecture | HIGH | GSAP React-Integration offiziell dokumentiert. useGSAP Pattern ist der empfohlene Weg. Lenis+ScrollTrigger Sync gut dokumentiert. |
| Pitfalls | HIGH | Memory Leak und Cleanup-Probleme sind gut dokumentiert in GSAP Community und Blog-Posts. |

## Gaps to Address

- Genaue GSAP Bundle-Size nach Tree-Shaking mit nur ScrollTrigger + SplitText (geschaetzt ~45KB, nicht gemessen)
- View Transitions API Stabilitaet zum Zeitpunkt der Phase-4-Implementierung
- Ob Lenis auf Mobile komplett deaktiviert werden sollte oder mit reduziertem Smoothing laufen kann
- Konkretes Timing/Easing-System (welche Easing-Kurven, Durations, Delays) -- braucht Design-Phase
