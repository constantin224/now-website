# Architecture Patterns: Premium Animation Layer

**Domain:** Animation layer on existing Next.js 16 App Router artist website
**Researched:** 2026-03-19
**Confidence:** HIGH (verified via GSAP official docs, Next.js docs, community patterns)

## Recommended Architecture

Animation als separate Layer uber der bestehenden Komponentenstruktur. Keine Vermischung von Animation-Logik und Business-Logik. GSAP + Lenis als Animation-Engine, CSS fur einfache Hover/Transitions.

```
Layer 1: CSS Transitions & Tailwind (base)
    - Hover states, micro-interactions, einfache Fades
    - Funktioniert in Server Components via className
    - Zero JS overhead

Layer 2: GSAP + ScrollTrigger (scroll + timeline)
    - Scroll-triggered section reveals
    - Scroll-linked parallax
    - Text-Animationen (SplitText)
    - Pinned/cinematische Sektionen
    - Client Components only ("use client")

Layer 3: Lenis (smooth scroll)
    - Smoothes Scroll-Gefuhl seitenweit
    - Synced mit GSAP ScrollTrigger
    - Ein Provider im Layout, fertig
```

### Warum diese Schichtung

1. **Layer 1 (CSS)** deckt 60-70% des visuellen Polish ab (Hover, Focus, Opacity-Transitions) ohne Bundle-Kosten. Server Components konnen das nutzen.
2. **Layer 2 (GSAP)** deckt die "Wow"-Effekte ab: scroll-getriggerte Reveals, Parallax, Text-Animationen, Timeline-Choreografie. Braucht Client Components, aber GSAP ist hochoptimiert.
3. **Layer 3 (Lenis)** sorgt fur das "Butter-smooth" Scroll-Gefuhl. Ein einmaliges Setup, synced mit ScrollTrigger.

## Component Tree: Wo Animation-Code lebt

### Bestehende Struktur (unverandert)

```
app/layout.tsx (Server) -- Root, Fonts, Metadata
  app/[locale]/layout.tsx (Server) -- Locale, Navigation, Footer
    app/[locale]/page.tsx (Server) -- Seiteninhalt
      components/* (Client wo notig) -- Interaktive Komponenten
```

### Animation Integration Points

```
app/layout.tsx (Server) -- UNVERANDERT
  app/[locale]/layout.tsx (Server) -- UNVERANDERT
    components/providers/SmoothScrollProvider.tsx (Client) -- NEU: Lenis + ScrollTrigger sync
      app/[locale]/template.tsx (Client) -- NEU: Page enter animation
        app/[locale]/page.tsx (Server) -- Unverandert
          components/ui/animated-section.tsx (Client) -- NEU: Scroll-reveal Wrapper
          components/ui/parallax-layer.tsx (Client) -- NEU: Parallax Wrapper
          components/* (Bestand) -- Bestehende Komponenten, unverandert
```

## Component Boundaries

| Component | Type | Responsibility | Communicates With |
|-----------|------|----------------|-------------------|
| `lib/gsap.ts` | Module | Zentrale GSAP Plugin-Registrierung | Alle animierten Komponenten importieren hieraus |
| `providers/SmoothScrollProvider.tsx` | Client | Lenis init + ScrollTrigger sync | Layout (wraps children) |
| `hooks/useScrollReveal.ts` | Client Hook | Wiederverwendbares fade-in/slide-up Pattern | Section-Komponenten |
| `hooks/useTextReveal.ts` | Client Hook | SplitText + ScrollTrigger Kombination | Headlines |
| `hooks/useParallax.ts` | Client Hook | Scroll-linked Y-Versatz | Hintergrund-Elemente |
| `components/ui/animated-section.tsx` | Client | Wrapper fur scroll-triggered reveals | Wraps bestehende Sektionen |
| `app/[locale]/template.tsx` | Client | Page enter animation | Wraps page content |

### Data Flow

```
Server Component (page.tsx)
  rendert Content + gibt ihn als children an Animation-Wrapper
    Animation Wrapper (Client Component)
      liest Scroll-Position via GSAP ScrollTrigger
      wendet CSS transforms an (GPU-beschleunigt)
      children bleiben server-gerendert (keine Re-Serialisierung)
```

**Prinzip:** Bestehende Komponenten werden NICHT umgeschrieben. Animation-Wrapper oder Custom Hooks fugen Verhalten hinzu. Wenn Animation deaktiviert ist (Mobile, reduced-motion), rendert der bestehende Content unverandert.

## Patterns to Follow

### Pattern 1: Client Boundary Isolation

**What:** "use client" nur in Animation-Dateien. Server Components bleiben Server Components.
**When:** Immer.

```typescript
// components/releases-section.tsx -- bleibt Server Component
export default async function ReleasesSection() {
  const releases = await fetchReleases(); // Server-side fetch, ISR
  return <AnimatedReleaseGrid releases={releases} />;
}

// components/animated-release-grid.tsx -- Client Component
"use client";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export function AnimatedReleaseGrid({ releases }) {
  const containerRef = useScrollReveal("stagger-up");
  return <div ref={containerRef}>...</div>;
}
```

### Pattern 2: useGSAP fur automatisches Cleanup

**What:** `useGSAP()` statt `useEffect()` fur alle GSAP-Animationen.
**When:** Jede GSAP-Animation in React.
**Why:** Automatisches Cleanup via gsap.context(). Verhindert Memory Leaks bei Route-Wechsel.

```typescript
"use client";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = ref.current;
    if (!el) return;

    gsap.from(el, {
      opacity: 0,
      y: 30,
      duration: 0.8,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });
  }, { scope: ref });

  return ref;
}
```

### Pattern 3: GSAP matchMedia fur Responsive

**What:** Desktop-only Animationen via ScrollTrigger.matchMedia().
**When:** Jede Animation die Mobile-Guard braucht.

```typescript
useGSAP(() => {
  ScrollTrigger.matchMedia({
    // Desktop: volle Animationen
    "(min-width: 768px)": function() {
      gsap.to(".parallax-bg", {
        y: -100,
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    },
    // Mobile: keine Parallax, nur einfache reveals
    "(max-width: 767px)": function() {
      // Statisch oder sehr einfache Animationen
    },
  });
}, { scope: containerRef });
```

### Pattern 4: Progressive Enhancement

**What:** Content sofort sichtbar, Animation on top.
**When:** Immer.
**Why:** Ohne JS (oder bei Fehler) muss Content sichtbar sein.

```typescript
// RICHTIG: gsap.from() -- Element startet im DOM sichtbar,
// GSAP setzt es zuruck und animiert nach vorn
gsap.from(el, { opacity: 0, y: 30 });

// FALSCH: opacity: 0 im CSS -- bleibt unsichtbar ohne JS
```

### Pattern 5: Lenis + ScrollTrigger Sync

**What:** Lenis' smooth scroll mit GSAP ScrollTrigger verbinden.
**When:** Einmal im SmoothScrollProvider.

```typescript
"use client";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useEffect } from "react";

export function SmoothScrollProvider({ children }) {
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: false });

    // Sync Lenis scroll position mit ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(lenis.raf);
    };
  }, []);

  return <>{children}</>;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: useEffect statt useGSAP

**What:** `useEffect(() => { gsap.to(...) })` ohne gsap.context().
**Why bad:** Kein Cleanup. ScrollTrigger-Instanzen leaken. Memory Leaks bei Route-Wechsel.
**Instead:** Immer `useGSAP()` aus `@gsap/react`.

### Anti-Pattern 2: CSS opacity:0 als Initial State

**What:** Elemente per CSS unsichtbar machen und per JS einblenden.
**Why bad:** Ohne JS bleibt Content unsichtbar. SEO/Accessibility-Problem.
**Instead:** `gsap.from()` verwenden -- Element ist im DOM sichtbar, GSAP setzt es zuruck und animiert.

### Anti-Pattern 3: Lenis + ScrollSmoother gleichzeitig

**What:** Zwei Smooth-Scroll-Systeme parallel.
**Why bad:** Doppelte RAF-Loops, Scroll-Position-Konflikte, Jank.
**Instead:** Nur Lenis. Kein ScrollSmoother.

### Anti-Pattern 4: Layout-Properties animieren

**What:** width, height, top, left, margin, padding animieren.
**Why bad:** Triggert Layout-Neuberechnung auf jedem Frame. Jank.
**Instead:** Nur `transform` (translate, scale, rotate) und `opacity`. GPU-beschleunigt.

### Anti-Pattern 5: AnimatePresence fur Page Exits in App Router

**What:** Framer Motion AnimatePresence um Seiten wickeln.
**Why bad:** App Router unmountet Seiten sofort. AnimatePresence braucht die alte Komponente gemountet. Fuhrt zu Hydration-Problemen.
**Instead:** Einfache Enter-Animation via template.tsx. Exit kommt spater via View Transitions API.

### Anti-Pattern 6: GSAP in Server Components

**What:** GSAP oder useRef in Server Components.
**Why bad:** Build-Fehler. Server Components haben keinen DOM-Zugriff.
**Instead:** Client Component Wrapper erstellen.

## File Structure

```
now-website/
  lib/
    gsap.ts                          # NEU: Plugin-Registrierung, re-exports
    hooks/
      useScrollReveal.ts             # NEU: Scroll-triggered fade/slide
      useTextReveal.ts               # NEU: SplitText + ScrollTrigger
      useParallax.ts                 # NEU: Scroll-linked Y-offset
  components/
    providers/
      SmoothScrollProvider.tsx       # NEU: Lenis + ScrollTrigger sync
    ui/
      animated-section.tsx           # NEU: Wrapper fur section reveals
      parallax-layer.tsx             # NEU: Parallax Wrapper
      stagger-grid.tsx               # NEU: Staggered list/grid reveal
      text-reveal.tsx                # NEU: Headline-Animation
      magnetic-button.tsx            # NEU: Cursor-Follow auf Buttons
  app/
    [locale]/
      template.tsx                   # NEU: Page enter animation
```

## Build Order

1. `lib/gsap.ts` -- Plugin-Registrierung (Grundlage)
2. `providers/SmoothScrollProvider.tsx` -- Lenis Setup (Grundlage)
3. `hooks/useScrollReveal.ts` -- Haufigster Anwendungsfall
4. `components/ui/animated-section.tsx` -- Wrapper-Komponente
5. `app/[locale]/template.tsx` -- Page enter animation
6. `hooks/useParallax.ts` + `parallax-layer.tsx` -- Desktop-only Tiefe
7. `hooks/useTextReveal.ts` + `text-reveal.tsx` -- Headlines
8. `stagger-grid.tsx` -- Release/Show-Listen
9. `magnetic-button.tsx` -- Polish, ganz zum Schluss

## Sources

- [GSAP React best practices](https://gsap.com/resources/React/)
- [GSAP ScrollTrigger.matchMedia](https://gsap.com/docs/v3/Plugins/ScrollTrigger/static.matchMedia())
- [Optimizing GSAP in Next.js 15](https://medium.com/@thomasaugot/optimizing-gsap-animations-in-next-js-15-best-practices-for-initialization-and-cleanup-2ebaba7d0232)
- [Lenis documentation](https://lenis.darkroom.engineering/)
- [Next.js viewTransition docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition)

---

*Architecture research: 2026-03-19*
