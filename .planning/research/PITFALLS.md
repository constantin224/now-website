# Domain Pitfalls: Premium Animation Layer

**Domain:** Adding GSAP/Lenis animations to existing Next.js 16 App Router website
**Researched:** 2026-03-19

## Critical Pitfalls

Fehler die zu Rewrites oder schwerwiegenden Problemen fuehren.

### Pitfall 1: ScrollTrigger Memory Leaks bei Route-Wechsel

**What goes wrong:** ScrollTrigger-Instanzen werden bei Route-Wechsel im App Router nicht aufgeraeumt. Alte Trigger reagieren auf Scroll-Events, neue kommen dazu. Nach mehreren Navigationen: hunderte Trigger, massive Jank, Crash.
**Why it happens:** Next.js App Router unmountet Komponenten sofort bei Navigation. Ohne explizites Cleanup bleiben GSAP-Instanzen im globalen State.
**Consequences:** Progressive Performance-Degradation. Seite wird nach 5-10 Navigationen unbrauchbar.
**Prevention:** IMMER `useGSAP()` aus `@gsap/react` verwenden statt `useEffect`. Der Hook nutzt `gsap.context()` intern und reverted automatisch alle Animationen beim Unmount.
**Detection:** `ScrollTrigger.getAll().length` in der Konsole pruefen. Sollte nach Navigation nicht wachsen.

### Pitfall 2: Content unsichtbar ohne JavaScript

**What goes wrong:** Elemente werden per CSS `opacity: 0` oder `visibility: hidden` gesetzt, damit GSAP sie einblenden kann. Wenn JS fehlschlaegt, bleibt Content unsichtbar.
**Why it happens:** Developer denken "JS laeuft immer". Aber SSR rendert zuerst HTML, Hydration kann scheitern, Crawlers fuehren oft kein JS aus.
**Consequences:** SEO-Problem (Googlebot sieht leere Seite), Accessibility-Problem.
**Prevention:** Niemals Initial-States im CSS setzen. `gsap.from()` verwenden -- Element ist im DOM sichtbar, GSAP setzt es temporaer zurueck und animiert vorwaerts. Ohne JS = Content normal sichtbar.
**Detection:** JavaScript im Browser deaktivieren und Seite laden.

### Pitfall 3: Lenis + ScrollTrigger Sync-Probleme

**What goes wrong:** Lenis und ScrollTrigger nutzen unterschiedliche Scroll-Positionen. Animationen triggern zu frueh, zu spaet, oder gar nicht.
**Why it happens:** Lenis uebernimmt das Scrollen und die native `scrollTop` Eigenschaft ist nicht mehr zuverlaessig. ScrollTrigger liest standardmaessig `scrollTop`.
**Consequences:** Animationen triggern an falschen Positionen. Parallax "springt". Pinned Sections kaputt.
**Prevention:** Korrekte Sync: `lenis.on("scroll", ScrollTrigger.update)` + `gsap.ticker.add((time) => lenis.raf(time * 1000))` + `gsap.ticker.lagSmoothing(0)`. Lenis mit `autoRaf: false`.
**Detection:** Animationen die an falschen Scroll-Positionen triggern.

### Pitfall 4: Client/Server Component Boundary-Fehler

**What goes wrong:** GSAP-Code oder DOM-Zugriff in Server Components. Build bricht oder Hydration-Mismatch.
**Why it happens:** Im App Router sind Komponenten standardmaessig Server Components. Developer vergessen `"use client"`.
**Consequences:** Build-Fehler (`window is not defined`), Hydration-Mismatch Warnings.
**Prevention:** Animation-Code NUR in explizit markierten Client Components. Daten-Fetching bleibt in Server Components, Animation-Wrapper als separate Client Components.
**Detection:** Build-Fehler mit `window` oder `document` References.

## Moderate Pitfalls

### Pitfall 5: Animation-Overload

**What goes wrong:** Jedes Element animiert. Seite fuehlt sich nicht cinematisch an sondern wie ein Weihnachtsbaum.
**Prevention:** Max 3-4 Animationstypen pro Seite. Hierarchie: wichtigste Elemente animieren, Rest dezent. Konsistente Timing-Kurven.

### Pitfall 6: Animationen blocken Content-Zugang

**What goes wrong:** User muss warten bis Animation fertig ist bevor Content lesbar wird.
**Prevention:** Max 0.6-0.8s Duration. `once: true` -- nicht bei Scroll-Zurueck nochmal. Trigger bevor Element voll sichtbar (`start: "top 85%"`).

### Pitfall 7: Parallax auf Mobile nicht deaktiviert

**What goes wrong:** Parallax auf Mobile = Jank, Akku-Drain, kaputtes Touch-Scroll.
**Prevention:** `ScrollTrigger.matchMedia()` mit `(min-width: 768px)` Gate. Projekt-Constraint verlangt das explizit.

### Pitfall 8: Layout-Property Animationen

**What goes wrong:** `width`, `height`, `top`, `left` animieren. Jeder Frame triggert Layout-Neuberechnung.
**Prevention:** NUR `transform` und `opacity`. GPU Compositor Thread.

### Pitfall 9: SplitText Resize-Bug

**What goes wrong:** Text bei einer Viewport-Breite gesplittet. Bei Resize stimmen Zeilenumbrueche nicht mehr mit Split-Elementen ueberein.
**Prevention:** GSAP SplitText mit `autoSplit: true` und Animationen im `onSplit()` Callback.

## Minor Pitfalls

### Pitfall 10: will-change Overuse

**What goes wrong:** `will-change: transform` auf zu vielen Elementen. GPU Memory Pressure.
**Prevention:** Nur auf Elemente die gerade animiert werden. GSAP setzt das automatisch.

### Pitfall 11: Scroll-Konflikte mit Lenis

**What goes wrong:** Lenis kollidiert mit `scroll-behavior: smooth` oder `scroll-snap` im CSS.
**Prevention:** `scroll-behavior: smooth` entfernen wenn Lenis aktiv. Scroll-Snap Bereiche muessen Lenis umgehen.

### Pitfall 12: GSAP Bundle nicht tree-shaken

**What goes wrong:** Gesamtes GSAP geladen obwohl nur Teile gebraucht.
**Prevention:** Named Imports: `import { ScrollTrigger } from "gsap/ScrollTrigger"`. Zentrale `lib/gsap.ts` die nur benoetigte Plugins exportiert.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| GSAP + Lenis Setup | Sync-Probleme (Pitfall 3) | Exakte Sync-Anleitung befolgen. Sofort testen. |
| Scroll Reveals | Content unsichtbar (Pitfall 2) | gsap.from() statt CSS opacity:0. JS-off Test. |
| Parallax | Mobile Performance (Pitfall 7) | matchMedia Gate von Anfang an. |
| Text Reveals | Resize-Bug (Pitfall 9) | autoSplit aktivieren. |
| Page Transitions | View Transitions instabil | template.tsx Enter-only als stabilen Fallback. |
| Polish (Cursor etc.) | Animation Overload (Pitfall 5) | Zurueckhaltung. Weniger ist mehr. |
| Alle Phasen | Memory Leaks (Pitfall 1) | useGSAP() konsequent. ScrollTrigger.getAll() monitoren. |

## Sources

- [GSAP React cleanup](https://gsap.com/resources/React/)
- [Optimizing GSAP in Next.js 15](https://medium.com/@thomasaugot/optimizing-gsap-animations-in-next-js-15-best-practices-for-initialization-and-cleanup-2ebaba7d0232)
- [GSAP SplitText docs](https://gsap.com/docs/v3/Plugins/SplitText/)

---

*Pitfalls research: 2026-03-19*
