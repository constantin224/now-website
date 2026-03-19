# Phase 2: Scroll Reveals & Typografie - Research

**Researched:** 2026-03-19
**Domain:** Scroll-triggered animations, Typography system, Content-flow restructuring
**Confidence:** HIGH

## Summary

Phase 2 baut auf der in Phase 1 erstellten Animation-Infrastruktur auf (GSAP + Lenis + useScrollReveal Hook) und wendet sie auf alle bestehenden Content-Sektionen an. Gleichzeitig wird das Typografie-System ueberarbeitet: uebergrosse Headlines mit fluiden `clamp()`-Groessen, konsistentes Section-Spacing via Design Tokens, und optimiertes Font-Loading via `next/font` mit `adjustFontFallback` fuer CLS nahe 0.

Die bestehenden Seiten (Home, About, Music, Shows, Press) sind Server Components mit statischem Content. Animation wird durch Client-Component-Wrapper oder direkte useScrollReveal-Integration hinzugefuegt. Die aktuelle Typografie nutzt bereits Cormorant Garamond als Heading-Font (via `next/font/google`), aber noch ohne Body-Font-Optimierung, ohne fluide Groessen und ohne konsistentes Spacing-System.

**Primary recommendation:** useScrollReveal Hook auf alle Content-Sektionen anwenden, Typografie-System mit `clamp()` Design Tokens in globals.css aufbauen, Body-Font via `next/font` hinzufuegen, Section-Spacing standardisieren, mindestens eine Full-Bleed-Sektion ausserhalb des Hero erstellen.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ANIM-01 | Scroll-triggered Fade/Slide Reveals auf allen Content-Sektionen mit GSAP ScrollTrigger | useScrollReveal Hook aus Phase 1 existiert bereits -- muss auf alle Sektionen angewendet werden. Wrapper-Komponente `ScrollReveal` vereinfacht die Integration. |
| TYPO-01 | Ueberarbeitete Headlines -- mutige, uebergrosse Typografie mit `clamp()` fuer fluide Groessen | CSS Custom Properties mit clamp()-Werten in globals.css. Heading-Font Cormorant Garamond existiert bereits, braucht groessere Sizes und letter-spacing Feintuning. |
| TYPO-02 | Konsistenter Section-Spacing-Rhythmus mit Design Tokens (grosszuegiges Padding) | Spacing Design Tokens als CSS Custom Properties: `--section-py-sm`, `--section-py-md`, `--section-py-lg`. Einheitliche Klasse `section-spacing` oder direkte Utility-Anwendung. |
| TYPO-03 | Verfeinertes Letter-Spacing und Line-Height System fuer bessere Lesbarkeit | Design Tokens fuer letter-spacing und line-height pro Hierarchie-Stufe. In @theme Block von Tailwind CSS 4 definieren. |
| TYPO-04 | `next/font` Integration mit size-adjust fuer CLS-freies Font-Loading | Heading-Font existiert bereits mit `display: "swap"`. Body-Font hinzufuegen. `adjustFontFallback` ist bei Google Fonts standardmaessig `true` -- verifizieren dass es aktiv ist. |
| STRUC-01 | Ueberarbeiteter Content-Flow -- Sektionsreihenfolge und -gewichtung fuer besseren Gesamteindruck | Analyse der bestehenden Seiten zeigt: About-Page hat guten Flow, Music-Page braucht klarere Sektions-Trennung, alle Pages brauchen grosszuegigeres Spacing. |
| STRUC-02 | Full-bleed Momente auch ausserhalb des Hero (Edge-to-Edge Sektionen) | CSS-Pattern: negative Margins + full viewport width. Ideal fuer Band-Foto auf About-Page oder Featured-Release auf Music-Page. |
</phase_requirements>

## Standard Stack

### Core (bereits installiert)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gsap | 3.14.2 | ScrollTrigger-basierte Scroll Reveals | Phase 1 installiert, useScrollReveal Hook bereit |
| @gsap/react | 2.1.2 | useGSAP Hook fuer automatisches Cleanup | Phase 1 installiert |
| next/font/google | (Next.js 16 built-in) | Font-Loading mit CLS-Prevention | Built-in, kein extra Package |

### Supporting (keine neuen Packages noetig)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| CSS `clamp()` | Fluide Typografie-Groessen | Alle Headline-Sizes, Body-Text |
| CSS Custom Properties | Design Tokens fuer Spacing und Typography | `@theme` Block in globals.css |
| Tailwind CSS 4 `@theme` | Token-Integration ins Utility-System | Spacing-Klassen, Font-Klassen |

**Installation:** Keine neuen Packages noetig. Alles baut auf Phase 1 und bestehenden Tools auf.

## Architecture Patterns

### Empfohlene Datei-Struktur (Aenderungen)

```
now-website/
  app/
    layout.tsx                    # AENDERN: Body-Font hinzufuegen, beide Font-Variablen exportieren
    globals.css                   # AENDERN: Typography Tokens, Spacing Tokens, clamp() System
    [locale]/
      about/page.tsx              # AENDERN: ScrollReveal + Full-Bleed + Spacing
      music/page.tsx              # AENDERN: ScrollReveal + Spacing + Content-Flow
      shows/page.tsx              # AENDERN: ScrollReveal + Spacing
      press/page.tsx              # AENDERN: ScrollReveal + Spacing
  components/
    scroll-reveal.tsx             # NEU: Deklarativer Wrapper um useScrollReveal
  lib/
    hooks/
      use-scroll-reveal.ts        # EXISTIERT: Kann unveraendert verwendet werden
```

### Pattern 1: ScrollReveal Wrapper-Komponente

**What:** Eine deklarative Client-Component die useScrollReveal kapselt und als Wrapper dient.
**When:** Fuer Server Components die Scroll-Reveals brauchen, ohne selbst zu Client Components zu werden.
**Why:** Die bestehenden Pages sind Server Components mit async Data Fetching. Sie koennen nicht direkt useScrollReveal aufrufen. Ein Wrapper loest das Problem elegant.

```typescript
// components/scroll-reveal.tsx
"use client";
import { useScrollReveal } from "@/lib/hooks/use-scroll-reveal";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Vertikaler Offset in Pixel (Standard: 30) */
  y?: number;
  /** Animationsdauer in Sekunden (Standard: 0.8) */
  duration?: number;
  /** Verzoegerung in Sekunden (Standard: 0) */
  delay?: number;
  /** ScrollTrigger start Position (Standard: "top 85%") */
  start?: string;
  /** HTML-Tag (Standard: "div") */
  as?: "div" | "section" | "article" | "aside";
}

export function ScrollReveal({
  children,
  className,
  as: Tag = "div",
  ...options
}: ScrollRevealProps) {
  const ref = useScrollReveal(options);
  return <Tag ref={ref} className={className}>{children}</Tag>;
}
```

### Pattern 2: Typography Design Tokens via CSS Custom Properties

**What:** Fluide Typografie-Groessen als CSS Custom Properties mit `clamp()`.
**When:** Fuer alle Headlines und Body-Text im gesamten Projekt.
**Why:** Ein zentrales System statt verstreuter Font-Sizes in jeder Komponente. Aenderungen an einer Stelle wirken ueberall.

```css
/* In globals.css @theme Block */
@theme {
  /* Bestehende Farben bleiben... */

  /* Typography Scale -- fluide mit clamp() */
  --font-heading: var(--font-cormorant), "Times New Roman", serif;
  --font-body: var(--font-inter), system-ui, -apple-system, sans-serif;

  /* Heading Sizes -- mutig und uebergross */
  --text-display: clamp(3rem, 2.4rem + 3vw, 6rem);      /* Hero, Seiten-Titel */
  --text-h1: clamp(2.25rem, 1.8rem + 2.25vw, 4.5rem);   /* Grosse Sektions-Titel */
  --text-h2: clamp(1.75rem, 1.4rem + 1.75vw, 3rem);     /* Sub-Sektionen */
  --text-h3: clamp(1.25rem, 1.1rem + 0.75vw, 2rem);     /* Kleine Ueberschriften */

  /* Section Spacing */
  --section-py: clamp(4rem, 3rem + 5vw, 8rem);           /* Standard Section Padding */
  --section-py-lg: clamp(6rem, 4rem + 8vw, 12rem);       /* Grosse Sektions-Abstaende */
  --section-gap: clamp(3rem, 2rem + 4vw, 6rem);          /* Gap zwischen Content-Bloecken */
}
```

### Pattern 3: Full-Bleed Sektion

**What:** Edge-to-Edge Sektionen die den gesamten Viewport fuellen.
**When:** Mindestens eine Sektion ausserhalb des Hero (Requirement STRUC-02).
**Why:** Erzeugt visuelle Abwechslung und cinematische Momente.

```css
/* Full-Bleed Pattern */
.full-bleed {
  width: 100vw;
  margin-left: calc(50% - 50vw);
}
```

Oder in Tailwind:
```html
<div class="w-screen relative left-1/2 -translate-x-1/2">
  <!-- Edge-to-Edge Content -->
</div>
```

### Anti-Patterns to Avoid

- **Jede Page-Component zu "use client" machen:** Stattdessen ScrollReveal-Wrapper verwenden. Pages bleiben Server Components fuer async Data Fetching.
- **Individuelle font-size Werte ueberall:** Stattdessen die Design Tokens (`--text-display`, `--text-h1`, etc.) verwenden.
- **Section-Padding per Komponente:** Stattdessen einheitliche `--section-py` Custom Property.
- **`opacity: 0` im CSS als Initial State:** GSAP `gsap.from()` setzt das automatisch. Content muss ohne JS sichtbar bleiben (Progressive Enhancement).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll-triggered Reveals | IntersectionObserver-basierte Loesung | useScrollReveal Hook (Phase 1) | Hook existiert bereits mit reduced-motion Guard und GSAP Cleanup |
| Fluide Font-Sizes | Manuelle Media Queries pro Breakpoint | `clamp()` CSS Function | Eine Zeile statt 3+ Media Queries. Smooth statt sprunghaft. |
| Font-Loading CLS Prevention | Manuelles size-adjust | `next/font` adjustFontFallback | next/font berechnet size-adjust automatisch aus den Font-Files |
| Staggered Reveal | Eigene Delay-Berechnung | GSAP `stagger` Property | GSAP stagger ist getestet, performant, und in einer Zeile konfiguriert |

**Key insight:** Phase 1 hat die schwere Arbeit bereits erledigt. Phase 2 ist Anwendung (useScrollReveal ueberall platzieren) + Design-System (Typography Tokens definieren), nicht neue Infrastruktur.

## Common Pitfalls

### Pitfall 1: Font-Loading ohne Body-Font Optimierung
**What goes wrong:** Aktuell nutzt der Body `system-ui` direkt als CSS-Wert in globals.css, nicht via `next/font`. Das bedeutet keine `adjustFontFallback`-Optimierung fuer den Body-Text.
**Why it happens:** Der Heading-Font wurde via `next/font` geladen, aber kein dedizierter Body-Font definiert.
**How to avoid:** Entweder einen dedizierten Body-Font (z.B. Inter) via `next/font` laden, oder explizit dokumentieren dass system-ui bewusst gewaehlt ist (kein CLS-Risiko da kein Web-Font).
**Warning signs:** CLS-Wert > 0 bei Lighthouse Test.

### Pitfall 2: clamp() ohne rem-Basiswert
**What goes wrong:** `clamp(48px, 5vw, 96px)` skaliert nicht mit Browser-Zoom und verletzt WCAG 1.4.4 (Resize Text).
**Why it happens:** Viewport-Units (vw) ignorieren Browser-Zoom-Einstellungen.
**How to avoid:** Immer `rem` als Minimum/Maximum verwenden und `vw` nur als idealen Wert: `clamp(3rem, 2.4rem + 3vw, 6rem)`. Die `rem`-Werte stellen sicher, dass Zoom funktioniert.
**Warning signs:** Text waechst nicht bei Cmd+Plus im Browser.

### Pitfall 3: ScrollReveal auf zu vielen kleinen Elementen
**What goes wrong:** Jeder Absatz, jede Zeile einzeln animiert. Wirkt unruhig und stottert.
**Why it happens:** Man animiert alles was geht statt bewusst zu choreografieren.
**How to avoid:** ScrollReveal auf Sektions-Ebene anwenden (ganze Bloecke), nicht auf individuelle Elemente. Maximal 1-2 Reveal-Punkte pro Viewport-Hoehe.
**Warning signs:** Mehr als 10 ScrollTrigger-Instanzen gleichzeitig aktiv.

### Pitfall 4: Full-Bleed bricht Container-Overflow
**What goes wrong:** `width: 100vw` mit `margin-left: calc(50% - 50vw)` erzeugt horizontales Scrolling.
**Why it happens:** 100vw schliesst die Scrollbar-Breite ein, aber 50% nicht.
**How to avoid:** Auf dem Parent-Container `overflow-x: hidden` setzen (am besten auf `<body>` oder `<main>`). Oder `overflow-x: clip` verwenden (modernere Alternative ohne Scroll-Container-Nebeneffekte).
**Warning signs:** Horizontaler Scrollbar erscheint auf Desktop.

### Pitfall 5: Cormorant Garamond Weights nicht vollstaendig
**What goes wrong:** Headlines sehen duenn aus weil nur Weight 300/400/600 geladen sind.
**Why it happens:** Cormorant Garamond bietet 300-700, aber Bold (700) wurde nicht geladen.
**How to avoid:** Weight 700 hinzufuegen fuer mutige Headlines: `weight: ["300", "400", "600", "700"]`.
**Warning signs:** `font-weight: bold` faellt auf naechst-niedrigeres Weight zurueck.

## Code Examples

### Beispiel 1: ScrollReveal Wrapper in einer Server Component Page

```typescript
// app/[locale]/about/page.tsx (bleibt Server Component)
import { ScrollReveal } from "@/components/scroll-reveal";

export default async function AboutPage({ params }) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  return (
    <section className="py-[var(--section-py)] px-6">
      {/* Section Label -- kein Reveal noetig (sofort sichtbar) */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-16">
        {t.about.title}
      </p>

      {/* Hero-Bild -- Full-Bleed mit ScrollReveal */}
      <ScrollReveal className="full-bleed mb-[var(--section-gap)]">
        <div className="relative h-[50vh] md:h-[70vh]">
          <Image src="/band-photo-3.jpg" alt="Now." fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/20 to-transparent" />
        </div>
      </ScrollReveal>

      {/* Bio mit Reveal */}
      <ScrollReveal className="max-w-2xl mx-auto" y={40} duration={1}>
        <p className="text-sand/70 text-lg leading-relaxed">{t.about.bio_1}</p>
      </ScrollReveal>
    </section>
  );
}
```

### Beispiel 2: Typography Tokens in globals.css (Tailwind CSS 4)

```css
/* globals.css */
@import "tailwindcss";

@theme {
  /* Farben (bestehend) */
  --color-bg-base: #0e0e0e;
  /* ... */

  /* Fonts */
  --font-heading: var(--font-cormorant), "Times New Roman", serif;
  --font-body: var(--font-inter), system-ui, -apple-system, sans-serif;

  /* Typography Scale */
  --text-display: clamp(3rem, 2.4rem + 3vw, 6rem);
  --text-h1: clamp(2.25rem, 1.8rem + 2.25vw, 4.5rem);
  --text-h2: clamp(1.75rem, 1.4rem + 1.75vw, 3rem);
  --text-h3: clamp(1.25rem, 1.1rem + 0.75vw, 2rem);
  --text-body: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --text-small: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);

  /* Section Spacing */
  --spacing-section: clamp(4rem, 3rem + 5vw, 8rem);
  --spacing-section-lg: clamp(6rem, 4rem + 8vw, 12rem);
  --spacing-block: clamp(3rem, 2rem + 4vw, 6rem);
}

@layer base {
  body {
    background-color: var(--color-bg-base);
    color: var(--color-sand);
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
    overflow-x: clip; /* Verhindert horizontalen Scroll bei Full-Bleed */
  }

  h1, h2, h3, h4 {
    font-family: var(--font-heading);
  }

  /* Full-Bleed Utility */
  .full-bleed {
    width: 100vw;
    margin-left: calc(50% - 50vw);
  }
}
```

### Beispiel 3: next/font Setup mit zwei Fonts

```typescript
// app/layout.tsx
import { Cormorant_Garamond, Inter } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
  // adjustFontFallback ist standardmaessig true fuer Google Fonts
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({ children }) {
  return children;
}

// Beide Font-Variablen exportieren fuer Locale-Layout
export const fontVariables = `${cormorant.variable} ${inter.variable}`;
```

```typescript
// app/[locale]/layout.tsx
import { fontVariables } from "@/app/layout";

export default async function LocaleLayout({ children, params }) {
  // ...
  return (
    <html lang={locale} className={fontVariables}>
      <body>
        {/* ... */}
      </body>
    </html>
  );
}
```

### Beispiel 4: Staggered Grid Reveal fuer Discography

```typescript
// Innerhalb einer Client-Wrapper-Komponente
"use client";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export function StaggerGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(el.children, {
        opacity: 0,
        y: 30,
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      });
    });
  }, { scope: ref });

  return <div ref={ref} className={className}>{children}</div>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Media Queries fuer Font-Sizes | `clamp()` fluide Typography | 2022+ (breit unterstuetzt) | Eliminiert Breakpoint-Spruenge, reduziert CSS um 30-50% |
| Google Fonts via `<link>` Tag | `next/font` Self-Hosting | Next.js 13+ (2023) | Kein externer Request, automatisches size-adjust, CLS nahe 0 |
| px-basierte Sizes | rem-basierte Sizes mit vw-Mischung | Accessibility Best Practice | Zoom funktioniert korrekt (WCAG 1.4.4) |
| AOS/ScrollMagic | GSAP ScrollTrigger | 2020+ | Praezisere Kontrolle, bessere Performance, aktiv gepflegt |
| overflow: hidden fuer Full-Bleed | overflow-x: clip | 2024+ (Safari 16+) | clip erzeugt keinen neuen Scroll-Container (sticky/fixed funktioniert) |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Keine Tests vorhanden (kein Test-Framework konfiguriert) |
| Config file | none -- siehe Wave 0 |
| Quick run command | `npm run build` (Build-Fehler erkennen) |
| Full suite command | `npm run build && npm run lint` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANIM-01 | Scroll-triggered Reveals auf allen Sektionen | manual | Visuell pruefen: Sektionen faden beim Scrollen ein | n/a |
| TYPO-01 | Uebergrosse Headlines mit clamp() | manual | Browser-Resize von 320px bis 1920px, Headlines skalieren fluide | n/a |
| TYPO-02 | Konsistentes Section-Spacing | manual | Visuell pruefen: gleichmaessige Abstaende zwischen Sektionen | n/a |
| TYPO-03 | Letter-Spacing und Line-Height System | manual | Visuell pruefen + Browser DevTools CSS inspection | n/a |
| TYPO-04 | CLS-freies Font-Loading | smoke | `npm run build` erfolgreich + Lighthouse CLS < 0.05 | n/a |
| STRUC-01 | Ueberarbeiteter Content-Flow | manual | Visuell pruefen: Seitenstruktur wirkt durchdacht | n/a |
| STRUC-02 | Full-Bleed Sektion ausserhalb Hero | manual | Visuell pruefen: mindestens eine Edge-to-Edge Sektion | n/a |

### Sampling Rate
- **Per task commit:** `npm run build` (Build darf nicht brechen)
- **Per wave merge:** `npm run build && npm run lint`
- **Phase gate:** Build green + visuelle Pruefung aller Seiten in Desktop und Mobile Viewport

### Wave 0 Gaps
- Kein Test-Framework installiert -- Tests sind manuell/visuell fuer diese Phase
- `npm run build` ist der primaere automatisierte Check (TypeScript-Fehler, Import-Fehler)

## Open Questions

1. **Body-Font Wahl: Inter oder system-ui?**
   - What we know: Aktuell wird `system-ui` als Body-Font verwendet. Inter ist die populaerste sans-serif Google Font und wuerde CLS-Optimierung via next/font erhalten.
   - What's unclear: Ob der User einen spezifischen Body-Font will oder system-ui bewusst gewaehlt hat.
   - Recommendation: Inter via next/font hinzufuegen. system-ui als Fallback. CLS-Benefit ueberwiegt die ~15KB extra. Falls User lieber system-ui behaelt, ist das auch valide (kein CLS-Risiko da kein Web-Font-Swap).

2. **Welche Sektionen bekommen Full-Bleed?**
   - What we know: STRUC-02 verlangt mindestens eine Full-Bleed-Sektion ausserhalb des Hero.
   - What's unclear: Genau welche. Kandidaten: Band-Foto auf About-Page, Featured Release auf Music-Page.
   - Recommendation: About-Page Band-Foto als Full-Bleed (am staerksten visuell). Zweiter Kandidat: Music-Page Featured Release Cover.

3. **Content-Flow Aenderungen (STRUC-01)**
   - What we know: Die aktuelle Seitenstruktur ist funktional aber wirkt noch Template-artig.
   - What's unclear: Wie weit der Content-Flow umstrukturiert werden soll.
   - Recommendation: Fokus auf Spacing, Gewichtung und visuelle Hierarchie. Keine Reihenfolge-Aenderungen in Phase 2 -- das wuerde den Scope sprengen. Groesseres Spacing + uebergrosse Headlines + Reveals erzeugen bereits einen deutlich anderen Eindruck.

## Sources

### Primary (HIGH confidence)
- [Next.js Font Optimization](https://nextjs.org/docs/app/getting-started/fonts) -- next/font API, CSS variables, Tailwind integration (verified 2026-03-19)
- [Next.js Font API Reference](https://nextjs.org/docs/app/api-reference/components/font) -- adjustFontFallback, variable, display options (verified 2026-03-19)
- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) -- ScrollTrigger API (aus Phase 1 Research)
- Phase 1 Code: `lib/hooks/use-scroll-reveal.ts`, `lib/gsap.ts`, `components/providers/smooth-scroll-provider.tsx`

### Secondary (MEDIUM confidence)
- [Smashing Magazine: Modern Fluid Typography Using CSS Clamp](https://www.smashingmagazine.com/2022/01/modern-fluid-typography-css-clamp/) -- clamp() Patterns und Accessibility
- [Piccalilli: Fluid Typography with CSS clamp](https://piccalil.li/blog/fluid-typography-with-css-clamp/) -- clamp() Formeln
- [DebugBear: Fixing Layout Shifts Caused by Web Fonts](https://www.debugbear.com/blog/web-font-layout-shift) -- CLS Prevention Strategien
- [Cormorant Garamond - Google Fonts](https://fonts.google.com/specimen/Cormorant+Garamond) -- Verfuegbare Weights

### Tertiary (LOW confidence)
- [ClampGenerator](https://clampgenerator.com/blog/fluid-typescale-modern-css-without-media-queries/) -- Fluid Typescale Generator Tool

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- alles bereits installiert oder built-in
- Architecture: HIGH -- Pattern baut direkt auf Phase 1 Infrastruktur auf
- Typography: HIGH -- clamp() und next/font sind gut dokumentiert und breit unterstuetzt
- Pitfalls: HIGH -- basiert auf konkreter Codebase-Analyse und bekannten CSS Eigenheiten

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stabiles Technologie-Feld, keine schnellen Aenderungen erwartet)
