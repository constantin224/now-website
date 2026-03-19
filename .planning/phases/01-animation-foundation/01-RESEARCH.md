# Phase 1: Animation Foundation - Research

**Researched:** 2026-03-19
**Domain:** GSAP + Lenis Animation Infrastructure auf Next.js 16 App Router
**Confidence:** HIGH

## Summary

Phase 1 legt die gesamte Animation-Infrastruktur fuer alle weiteren Phasen. Der Stack ist klar: GSAP 3.14.2 mit `@gsap/react` 2.1.2 fuer Animationen, Lenis 1.3.19 fuer Smooth Scroll auf Desktop. Die Hauptarbeit besteht aus vier Bausteinen: (1) GSAP Plugin-Registrierung als zentrale Datei, (2) Lenis Provider mit GSAP-Ticker-Sync und Mobile-Guard, (3) `prefers-reduced-motion` Respektierung durchgaengig, (4) ein wiederverwendbarer `useScrollReveal` Hook mit automatischem Cleanup via `useGSAP()`.

Kritisch ist die korrekte Lenis-ScrollTrigger-Synchronisation (`autoRaf: false`, GSAP Ticker treibt Lenis) und die konsequente Verwendung von `useGSAP()` statt `useEffect` fuer alle GSAP-Animationen. Die bestehende `scroll-behavior: smooth` im CSS muss entfernt werden wenn Lenis aktiv ist -- die beiden Systeme kollidieren. Fuer Mobile/Touch wird Lenis gar nicht initialisiert (nativer Scroll), und `gsap.matchMedia()` (nicht das veraltete `ScrollTrigger.matchMedia()`) schuetzt alle Desktop-only-Effekte.

**Primary recommendation:** GSAP zentral registrieren, Lenis conditional (Desktop-only) mit GSAP-Ticker-Sync, `useGSAP()` fuer alles, `gsap.matchMedia()` fuer responsive Guards, `gsap.from()` statt CSS-opacity-Hacks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ANIM-02 | Smooth Scroll via Lenis mit korrektem GSAP Ticker Sync (Desktop only, Mobile native) | Lenis Provider Pattern mit `autoRaf: false`, GSAP Ticker Sync, Mobile-Guard via `matchMedia`/Touch-Detection |
| ANIM-03 | `prefers-reduced-motion` Support -- alle Animationen respektieren User-Einstellung | `gsap.matchMedia()` mit `(prefers-reduced-motion: no-preference)` Gate, Early Return in Hooks |
| ANIM-04 | useScrollReveal Hook mit IntersectionObserver/ScrollTrigger und automatischem Cleanup via useGSAP | `useGSAP()` Hook mit `scope` Option, ScrollTrigger `toggleActions`, automatisches Context-Cleanup |
| ANIM-05 | Mobile Guard -- Parallax, Grain, Cursor-Effekte nur auf Desktop via matchMedia | `gsap.matchMedia()` (v3.11+) mit Breakpoint-Functions, automatisches Revert bei Resize |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gsap | 3.14.2 | Animation Engine, ScrollTrigger, Timelines | Industry-Standard fuer cinematic web animation. Seit April 2025 komplett kostenlos (Webflow-Akquisition). ScrollTrigger ist unuebertroffen. |
| @gsap/react | 2.1.2 | React-Integration via `useGSAP()` Hook | Automatisches Cleanup via `gsap.context()`. SSR-safe (faellt auf `useEffect` zurueck). Verhindert Memory Leaks bei Route-Wechsel. |
| lenis | 1.3.19 | Smooth Scroll (Desktop only) | Lightweight (<4KB), zugaenglich (bricht nativen Scroll nicht), perfekte GSAP-Integration. De-facto Standard fuer Premium-Scroll. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lenis/react | (in lenis enthalten) | ReactLenis Provider + useLenis Hook | Optional -- kann stattdessen auch manuell mit `new Lenis()` in useEffect arbeiten. ReactLenis vereinfacht Context-basiertes Setup. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Lenis | GSAP ScrollSmoother | ScrollSmoother ist schwerer, lockt in GSAPs Scroll-System ein. Lenis ist leichter und flexibler. |
| `gsap.matchMedia()` | `ScrollTrigger.matchMedia()` | **ScrollTrigger.matchMedia() ist deprecated** seit GSAP 3.11. gsap.matchMedia() ist der Nachfolger. |
| Eigener Lenis-Provider | `lenis/react` ReactLenis | ReactLenis bietet fertigen Context+Hook. Eigener Provider gibt mehr Kontrolle ueber Mobile-Guard Logik. Fuer dieses Projekt: eigener Provider bevorzugt wegen Desktop-only Guard. |

**Installation:**
```bash
npm install gsap @gsap/react lenis
```

**Version verification:** Alle Versionen am 2026-03-19 via `npm view` bestaetigt:
- gsap: 3.14.2
- @gsap/react: 2.1.2
- lenis: 1.3.19

## Architecture Patterns

### Recommended Project Structure
```
lib/
  gsap.ts                              # Zentrale Plugin-Registrierung, re-exports
  hooks/
    useScrollReveal.ts                 # Wiederverwendbarer Scroll-Reveal Hook
    useMediaQuery.ts                   # Utility: reduced-motion + device detection
components/
  providers/
    smooth-scroll-provider.tsx         # Lenis + ScrollTrigger Sync (Desktop only)
```

### Pattern 1: Zentrale GSAP-Registrierung
**What:** Alle GSAP Plugins einmal registrieren, alle Imports aus einer Datei.
**When to use:** Immer -- verhindert mehrfache Registrierung und erleichtert Tree-Shaking.
**Example:**
```typescript
// lib/gsap.ts
"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export { gsap, ScrollTrigger, useGSAP };
```
Source: GSAP React Docs (https://gsap.com/resources/React/)

### Pattern 2: Conditional Lenis Provider (Desktop-only)
**What:** Lenis nur auf Desktop-Geraeten initialisieren. Auf Mobile/Touch nativer Scroll.
**When to use:** ANIM-02 -- Smooth Scroll soll Mobile nicht beeinflussen.
**Example:**
```typescript
// components/providers/smooth-scroll-provider.tsx
"use client";
import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Mobile/Touch: kein Lenis, nativer Scroll
    const isDesktop = window.matchMedia("(min-width: 768px)").matches
      && !("ontouchstart" in window);
    if (!isDesktop) return;

    const lenis = new Lenis({ autoRaf: false });
    lenisRef.current = lenis;

    // Sync: Lenis informiert ScrollTrigger ueber Scroll-Position
    lenis.on("scroll", ScrollTrigger.update);

    // GSAP Ticker treibt Lenis RAF (ein einziger Loop)
    const update = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(update);
      lenisRef.current = null;
    };
  }, []);

  return <>{children}</>;
}
```
Source: Lenis GitHub README, Bridger Tower Guide (https://bridger.to/lenis-nextjs)

### Pattern 3: useGSAP mit gsap.matchMedia fuer Responsive + Accessibility
**What:** `gsap.matchMedia()` kombiniert Media-Query-Gates (Desktop, reduced-motion) mit automatischem Cleanup.
**When to use:** ANIM-03 + ANIM-05 -- jede Animation die Desktop-only ist oder reduced-motion respektieren muss.
**Example:**
```typescript
// In einem Hook oder Komponente
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export function useScrollReveal(options?: { y?: number; duration?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(el, {
        opacity: 0,
        y: options?.y ?? 30,
        duration: options?.duration ?? 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      });
    });
  }, { scope: ref });

  return ref;
}
```
Source: GSAP Docs (https://gsap.com/docs/v3/GSAP/gsap.matchMedia())

**Wichtig:** `gsap.matchMedia()` ist seit v3.11 der Nachfolger von `ScrollTrigger.matchMedia()`. Die alte Methode ist deprecated. `gsap.matchMedia()` ist ein spezialisierter Wrapper um `gsap.context()` -- alle darin erstellten Animationen und ScrollTrigger werden automatisch reverted wenn die Media Query nicht mehr matched.

### Pattern 4: Progressive Enhancement (gsap.from)
**What:** `gsap.from()` statt CSS `opacity: 0`. Content ist im DOM sichtbar, GSAP setzt temporaer zurueck und animiert vorwaerts.
**When to use:** IMMER bei scroll-getriggerten Reveals.
**Why:** Ohne JS (oder bei Fehler) bleibt Content sichtbar. Kein SEO/Accessibility-Problem.

### Pattern 5: contextSafe fuer Event-Handler
**What:** Animationen in Click/Hover-Handlern muessen via `contextSafe()` gewrappt werden.
**When to use:** Wenn Animationen ausserhalb des useGSAP-Callbacks erstellt werden (z.B. onClick).
**Example:**
```typescript
const { contextSafe } = useGSAP({ scope: containerRef });
const handleClick = contextSafe(() => {
  gsap.to(".element", { rotation: 180 });
});
```
Source: GSAP React Docs (https://gsap.com/resources/React/)

### Anti-Patterns to Avoid
- **useEffect statt useGSAP:** Kein automatisches Cleanup. Memory Leaks bei Route-Wechsel. ScrollTrigger-Instanzen akkumulieren.
- **CSS opacity:0 als Initial State:** Content unsichtbar ohne JS. SEO/Accessibility-Problem. Stattdessen `gsap.from()`.
- **Lenis + ScrollSmoother gleichzeitig:** Zwei Smooth-Scroll-Systeme = doppelte RAF-Loops, Scroll-Position-Konflikte, Jank.
- **Layout-Properties animieren:** `width`, `height`, `top`, `left` triggern Layout-Neuberechnung. NUR `transform` und `opacity`.
- **ScrollTrigger.matchMedia() verwenden:** Deprecated seit GSAP 3.11. `gsap.matchMedia()` nutzen.
- **GSAP in Server Components:** Build-Fehler (`window is not defined`). Immer `"use client"` Directive.
- **Lenis mit scroll-behavior: smooth im CSS:** Kollidiert. `scroll-behavior: smooth` MUSS entfernt werden wenn Lenis aktiv.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation Cleanup in React | Eigenes `gsap.context()` Management | `useGSAP()` aus `@gsap/react` | Hook handhabt Context-Erstellung, Revert bei Unmount, Strict Mode Kompatibilitaet automatisch |
| Responsive Animation Guards | Eigene `window.matchMedia` + addEventListener Logik | `gsap.matchMedia()` | Automatisches Revert aller Animationen wenn Breakpoint wechselt. Integriert mit gsap.context(). |
| Smooth Scroll Engine | Eigene `requestAnimationFrame` + `lerp` Scroll-Interpolation | Lenis | Edge Cases bei Touch, Keyboard-Navigation, Accessibility, Browser-Quirks sind geloest |
| Scroll-triggered Reveals | Eigener IntersectionObserver + CSS-Klassen-Toggle | GSAP ScrollTrigger | ScrollTrigger bietet scrub, pin, snap, callbacks, progress-tracking. IO kann nur "sichtbar/nicht sichtbar". |

**Key insight:** Die drei Pakete (gsap, @gsap/react, lenis) decken 100% der Anforderungen dieser Phase ab. Kein einziger Custom-Algorithmus noetig.

## Common Pitfalls

### Pitfall 1: Lenis + scroll-behavior CSS Konflikt
**What goes wrong:** Bestehende CSS-Regel `html { scroll-behavior: smooth; }` kollidiert mit Lenis.
**Why it happens:** Beide Systeme versuchen Scroll-Verhalten zu kontrollieren.
**How to avoid:** `scroll-behavior: smooth` aus `globals.css` entfernen. Lenis uebernimmt das. Auf Mobile (ohne Lenis) ist nativer Scroll ohnehin schnell genug.
**Warning signs:** Doppelte Scroll-Animationen, "Zittern" beim Scrollen.
**ACHTUNG:** Diese Regel existiert bereits in `app/globals.css` Zeile 23: `html { scroll-behavior: smooth; }` -- MUSS entfernt werden.

### Pitfall 2: ScrollTrigger Memory Leaks bei Route-Wechsel
**What goes wrong:** ScrollTrigger-Instanzen leaken bei Navigation im App Router.
**Why it happens:** Ohne Cleanup bleiben alte Trigger im globalen State.
**How to avoid:** IMMER `useGSAP()` verwenden. `ScrollTrigger.getAll().length` zum Debuggen.
**Warning signs:** Seite wird nach 5-10 Navigationen traeger.

### Pitfall 3: Content unsichtbar ohne JavaScript
**What goes wrong:** Elemente per CSS unsichtbar + per JS einblenden = Content weg ohne JS.
**Why it happens:** SSR rendert HTML, aber GSAP-Code laeuft erst nach Hydration.
**How to avoid:** `gsap.from()` verwenden -- Element startet sichtbar im DOM.
**Warning signs:** Leere Bereiche beim Laden, Googlebot sieht keinen Content.

### Pitfall 4: Lenis-ScrollTrigger Sync fehlt
**What goes wrong:** Animationen triggern an falschen Scroll-Positionen.
**Why it happens:** Lenis und ScrollTrigger lesen unterschiedliche Scroll-Positionen.
**How to avoid:** Exakte Sync-Kette: `lenis.on("scroll", ScrollTrigger.update)` + `gsap.ticker.add(update)` + `gsap.ticker.lagSmoothing(0)` + `autoRaf: false`.
**Warning signs:** Parallax "springt", Animationen triggern zu frueh/spaet.

### Pitfall 5: gsap.matchMedia() vergessen bei reduced-motion
**What goes wrong:** Animationen laufen trotz `prefers-reduced-motion: reduce`.
**Why it happens:** Developer vergessen den Check oder implementieren ihn inkonsistent.
**How to avoid:** `gsap.matchMedia()` mit `(prefers-reduced-motion: no-preference)` als Gate um ALLE Animationen. Zentral im Hook, nicht pro Komponente.
**Warning signs:** Seite bewegt sich obwohl OS-Setting "Reduce Motion" aktiv ist.

### Pitfall 6: lenis.css nicht importiert
**What goes wrong:** Lenis funktioniert nicht korrekt oder hat Styling-Probleme.
**Why it happens:** Lenis benoetigt ein kleines CSS-File fuer korrekte Funktion.
**How to avoid:** `import "lenis/dist/lenis.css"` im Provider oder Layout.
**Warning signs:** Scroll funktioniert nicht smooth, unerwartetes Verhalten.

## Code Examples

Verifizierte Patterns aus offiziellen Quellen:

### GSAP Plugin-Registrierung (lib/gsap.ts)
```typescript
// Source: https://gsap.com/resources/React/
"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

// Einmal registrieren -- alle Imports aus dieser Datei
gsap.registerPlugin(ScrollTrigger, useGSAP);

export { gsap, ScrollTrigger, useGSAP };
```

### Lenis + ScrollTrigger Sync
```typescript
// Source: Lenis GitHub README + https://bridger.to/lenis-nextjs
// WICHTIG: autoRaf: false -- GSAP Ticker ist der einzige RAF-Loop
const lenis = new Lenis({ autoRaf: false });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

### useScrollReveal Hook (komplett)
```typescript
// Source: GSAP React Docs + gsap.matchMedia Docs
"use client";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

interface ScrollRevealOptions {
  y?: number;
  duration?: number;
  delay?: number;
  start?: string;
}

export function useScrollReveal(options: ScrollRevealOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(el, {
        opacity: 0,
        y: options.y ?? 30,
        duration: options.duration ?? 0.8,
        delay: options.delay ?? 0,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: options.start ?? "top 85%",
          toggleActions: "play none none none",
        },
      });
    });
  }, { scope: ref });

  return ref;
}
```

### Provider-Integration im Layout
```typescript
// app/[locale]/layout.tsx -- SmoothScrollProvider einbinden
// WICHTIG: Provider muss innerhalb von <body> aber ueber <main> liegen
<body>
  <Navigation locale={locale} />
  <SmoothScrollProvider>
    <main>{children}</main>
  </SmoothScrollProvider>
  <Footer locale={locale} />
</body>
```

### CSS-Aenderung: scroll-behavior entfernen
```css
/* app/globals.css -- VORHER */
html { scroll-behavior: smooth; }

/* app/globals.css -- NACHHER */
/* scroll-behavior entfernt -- Lenis uebernimmt auf Desktop, Mobile braucht es nicht */
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ScrollTrigger.matchMedia()` | `gsap.matchMedia()` | GSAP 3.11 (2023) | Neuer Wrapper um gsap.context(), altes deprecated |
| `useEffect` + `gsap.context()` | `useGSAP()` Hook | @gsap/react 2.0 (2024) | Automatisches Cleanup, Strict Mode Support |
| `@studio-freight/lenis` | `lenis` (neuer Package-Name) | 2024 | Altes Package deprecated |
| Locomotive Scroll | Lenis | 2023 | Selbes Team (Darkroom), Lenis ist Nachfolger |
| Manuelle RAF-Loops | Lenis `autoRaf: true` oder GSAP Ticker | Lenis 1.x | Vereinfacht Setup, aber fuer GSAP-Sync `autoRaf: false` noetig |

## Open Questions

1. **lenis.css Import -- zwingend noetig?**
   - What we know: Lenis README empfiehlt `import "lenis/dist/lenis.css"`. Inhalt unklar (vermutlich minimal).
   - What's unclear: Ob die CSS-Datei zwingend fuer korrekte Funktion noetig ist oder nur Convenience.
   - Recommendation: Importieren -- schadet nicht, verhindert potenzielle Probleme.

2. **Lenis scroll-to-top bei Navigation**
   - What we know: Known Issue -- wenn Lenis nicht gestoppt hat beim Route-Wechsel, startet naechste Seite nicht oben.
   - What's unclear: Ob Next.js 16 App Router das automatisch handhabt oder ob `lenis.scrollTo(0)` bei Navigation noetig ist.
   - Recommendation: Testen nach Setup. Falls noetig: `usePathname()` watcher der `lenis.scrollTo(0, { immediate: true })` aufruft.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Keine vorhanden (kein Test-Framework im Projekt) |
| Config file | none -- Wave 0 muss Setup machen |
| Quick run command | n/a |
| Full suite command | n/a |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANIM-02 | Lenis laeuft auf Desktop, nativer Scroll auf Mobile | manual-only | Manuell: Desktop-Browser + Mobile-Browser testen | -- |
| ANIM-03 | `prefers-reduced-motion` disables alle Animationen | manual-only | Manuell: OS-Setting aendern, Seite laden, keine Bewegung sichtbar | -- |
| ANIM-04 | useScrollReveal Hook + Cleanup bei Route-Wechsel | manual-only | Manuell: `ScrollTrigger.getAll().length` in Console nach Navigation pruefen | -- |
| ANIM-05 | Parallax/Grain/Cursor nur auf Desktop | manual-only | Manuell: Mobile DevTools, keine schweren Effekte geladen | -- |

**Begruendung manual-only:** Alle Requirements betreffen Browser-Verhalten (Scroll, MediaQuery, DOM-Animation) das sich nicht sinnvoll mit Unit-Tests pruefen laesst. Integration/E2E-Tests waeren moeglich (Playwright), aber das Test-Framework existiert noch nicht und Playwright-Setup ist fuer Phase 1 ueberdimensioniert.

### Sampling Rate
- **Per task commit:** Manuell im Browser pruefen (Desktop + Mobile DevTools)
- **Per wave merge:** `npm run build` muss fehlerfrei durchlaufen
- **Phase gate:** Alle 4 Success Criteria manuell verifiziert

### Wave 0 Gaps
- [ ] Kein Test-Framework vorhanden -- fuer Phase 1 nicht blockierend (manual-only Tests)
- [ ] `npm run build` als Smoke-Test reicht fuer diese Phase

## Sources

### Primary (HIGH confidence)
- [GSAP React Integration](https://gsap.com/resources/React/) -- useGSAP API, Plugin-Registrierung, contextSafe, Cleanup
- [gsap.matchMedia() Docs](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()) -- Responsive Animation API (Nachfolger von ScrollTrigger.matchMedia)
- [ScrollTrigger.matchMedia() Docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/static.matchMedia()) -- Deprecated-Hinweis auf gsap.matchMedia()
- [Lenis GitHub README](https://github.com/darkroomengineering/lenis/blob/main/README.md) -- Constructor Options, GSAP Sync, CSS Import
- npm registry -- Versionen verifiziert: gsap 3.14.2, @gsap/react 2.1.2, lenis 1.3.19

### Secondary (MEDIUM confidence)
- [Lenis in Next.js Guide (Bridger Tower)](https://bridger.to/lenis-nextjs) -- LenisProvider Pattern, Mobile-Guard, GSAP Integration
- [Lenis GitHub Issue #319](https://github.com/darkroomengineering/lenis/issues/319) -- ReactLenis scroll-to-top Problem bei Navigation

### Tertiary (LOW confidence)
- Keine -- alle Findings durch offizielle Quellen verifiziert

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Versionen via npm verifiziert, Stack durch vorherige Research bestaetigt
- Architecture: HIGH -- Patterns aus offiziellen GSAP Docs + Lenis README
- Pitfalls: HIGH -- Durch GSAP Docs + bekannte Issues + Codebase-Analyse (scroll-behavior Konflikt) bestaetigt

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stabiler Stack, keine Breaking Changes erwartet)
