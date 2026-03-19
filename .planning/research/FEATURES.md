# Feature Landscape: Premium Artist Website Visual Upgrade

**Domain:** Artist/Band website -- cinematisches, professionelles Finish
**Researched:** 2026-03-19
**Overall confidence:** MEDIUM-HIGH

## Table Stakes

Features, die Besucher auf einer Premium-Artist-Website unbewusst erwarten. Fehlt etwas davon, wirkt die Seite wie ein Template oder Amateur-Projekt.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Scroll-triggered fade/slide reveals** | Jede Premium-Website animiert Content beim Scrollen ins Bild. Statische Seiten, wo alles sofort sichtbar ist, wirken flach und langweilig. | Low-Med | GSAP ScrollTrigger: fade + translateY. Kinder-Elemente gestaffelt (stagger). Einfachster, groesster Quick Win. |
| **Smooth scroll behavior** | Natives Browser-Scrolling fuehlt sich "ruckelig" an verglichen mit dem butterweichen Scroll auf Awwwards-Level Sites. | Med | Lenis (ca. 3KB gzip) + GSAP ticker sync. Auf Mobile deaktivieren fuer native Scroll-Performance. |
| **Mutige, uebergrosse Typografie** | Grosse Headlines mit grosszuegigem Whitespace signalisieren Selbstbewusstsein und Editorial-Qualitaet. Kleine, zaghafte Schrift = kleine, zaghafte Band. | Low | Variable fonts, `clamp()` fuer fluide Groessen, letter-spacing Feintuning. |
| **Full-bleed Bilder/Video** | Hero-Sektionen muessen den Viewport fuellen. Content mit Raendern schreit "Template-Site". | Low | Hero Video existiert bereits. Sicherstellen, dass auch andere Sektionen Edge-to-Edge Momente haben. |
| **Hover-Feedback auf allen interaktiven Elementen** | Buttons, Links, Cards ohne Hover-States fuehlen sich kaputt an. Subtile Scale-, Farb- oder Underline-Animation erwartet. | Low | CSS transitions, 200-300ms Dauer. Transform + opacity fuer GPU-Beschleunigung. |
| **Section-Spacing-Rhythmus** | Konsistenter, grosszuegiger vertikaler Abstand zwischen Sektionen. Enge Layouts wirken billig. | Low | Design Tokens fuer Section-Padding (z.B. `py-24 md:py-32 lg:py-40`). |
| **prefers-reduced-motion Unterstuetzung** | Accessibility-Anforderung. User mit vestibulaeren Stoerungen brauchen Motion-Opt-Out. Auch gut fuer Akku auf Mobile. | Low | Media Query um alle Animationen wrappen. GSAP `matchMedia` fuer JS-Animationen. |
| **Optimierte Ladezustaende** | Content der ohne Transition reinpoppt wirkt janky. Smooth Fade-In beim Laden. | Low | CSS opacity Transition on mount. Kein aufwendiger Preloader noetig. |
| **Dunkles, stimmungsvolles Farbschema** | Bei Band-Sites signalisieren dunkle Hintergruende mit High-Contrast Text und Akzentfarben kuenstlerische Intention. | Low | Farbschema existiert bereits. Kontrast-Verhaeltnisse und Akzent-Nutzung verfeinern. |

## Differentiators

Features, die von "professionell" zu "wow, die nehmen ihre Online-Praesenz ernst" heben. Nicht erwartet, aber hinterlassen bleibenden Eindruck.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Parallax Depth Layers** | Hintergrund/Vordergrund-Elemente die sich mit unterschiedlicher Geschwindigkeit bewegen erzeugen cinematische Tiefe. Verwandelt flache Seiten in visuelle Stories. | Med | GSAP ScrollTrigger mit translateY auf verschiedenen Raten. Nur Desktop -- auf Mobile deaktivieren (Projekt-Constraint). |
| **Text Reveal Animationen** | Headlines die Zeichen fuer Zeichen oder Wort fuer Wort erscheinen (Clip/Mask-Reveal, Slide-up pro Zeile) wirken editorial und intentional. | Med | SplitType Library oder manuelles Span-Wrapping + GSAP stagger. Trigger auf Scroll-into-View. |
| **Magnetische/reaktive Hover-Effekte** | Elemente die dem Cursor auf Hover subtil folgen (magnetische Buttons, Image-Tilt). Erzeugt spielerische Interaktivitaet ohne billig zu wirken. | Med | Kleines JS: Mausposition relativ zum Element tracken, subtilen Transform anwenden. Nur Desktop. |
| **Smooth Page Transitions** | Crossfade oder Slide zwischen Seiten statt harter Cuts. Macht Multi-Page Site zu einem kohaerenten Erlebnis. | Med-High | Next.js View Transitions API (experimental in Next.js 16, `viewTransition: true`). Browser: Chrome, Edge, Safari 18+. Kein Firefox. Alternative: Framer Motion AnimatePresence. |
| **Staggered Grid Animationen** | Grid-Items (Releases, Fotos) die mit zeitversetzten Delays animieren, wirken choreografiert statt zufaellig. | Low-Med | GSAP stagger Property oder CSS `animation-delay` mit `nth-child`. |
| **Grain/Noise Texture Overlay** | Subtiler Film-Grain ueber dunklen Sektionen fuegt analoge Waerme und visuelle Tiefe hinzu. Standard auf High-End Creative Sites. | Low | CSS `background-image` mit kleinem Noise-PNG, `mix-blend-mode`, niedrige Opacity. Auf Mobile deaktivieren. |
| **Custom Cursor** | Cursor der sich auf Hover veraendert (waechst zum Kreis, zeigt "Play" auf Video). Signatur von Awwwards-Level Sites. | Med | Custom Div das Cursor-Position folgt mit GSAP oder CSS. Nur Desktop. Darf Usability nicht beeintraechtigen. |
| **Section-Uebergaenge** | Visuelle Bruecken zwischen Sektionen (Farbverlauf-Washes, Gradient-Fades, diagonale Divider) statt harter Sektions-Grenzen. | Low-Med | CSS Gradients, clip-path oder SVG Divider. Erzeugt Flow. |
| **Cinematische Pinned Sections** | Sektionen die beim Scrollen fixiert bleiben waehrend Content sich darin veraendert (Pin + Animate + Release). Fuehlt sich an wie Filmszenen. | High | GSAP ScrollTrigger `pin`. Braucht gutes Timing und Choreografie. Starker Effekt aber komplex zu calibrieren. |
| **Farb-/Atmosphaere-Shifts per Section** | Hintergrundfarbe oder Stimmung wechselt beim Scrollen zwischen Sektionen. | Med | CSS custom properties + ScrollTrigger. Braucht Design-Konzept. |

## Anti-Features

Features die bewusst NICHT gebaut werden sollen. Diese schaden entweder der UX, wirken veraltet, oder sind Overkill fuer eine Band-Website.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Aufwendiger Preloader/Intro-Screen** | User springen ab wenn sie 2-3 Sekunden warten muessen. Preloader waren ein 2015er-Trend und signalisieren "diese Seite ist langsam" statt "diese Seite ist premium". | Simpler Opacity Fade-in beim First Paint. Content progressiv erscheinen lassen. |
| **Custom Cursor auf Mobile** | Touch-Geraete haben keinen Cursor. JS-Tracking verschwendet Ressourcen. | Alle Cursor-Effekte auf Touch/Mobile deaktivieren. |
| **Parallax auf Mobile** | Toetet Scroll-Performance, leert den Akku, fuehlt sich auf den meisten Phones janky an. Projekt-Constraint verbietet es explizit. | Statische Positionierung auf Mobile. Parallax ist Desktop-only Enhancement. |
| **Auto-Play Audio** | Universell verhasst. Browser blockieren es sowieso. Zerstoert Vertrauen. | User initiiert Audio ueber klare Play-Buttons. Deezer-Integration existiert. |
| **Schwere WebGL/Three.js Effekte** | Riesige Bundle-Size, GPU-Drain, komplexe Wartung. Overkill fuer eine Band-Site die schnell laden soll. | Tiefe mit CSS Transforms, Blend Modes und leichtgewichtigem Canvas bei Bedarf. |
| **Infinite Scroll** | Schlecht fuer eine Band-Site mit klaren Sektionen (Music, Shows, About). User brauchen klare Navigations-Landmarks. | Klare Seiten/Sektionen mit Headings und Scroll-to Verhalten. |
| **Scroll Hijacking** | Scroll-Geschwindigkeit/-Richtung uebernehmen verwirrt User. Hohe Bounce Rate. | Scroll-triggered Animationen die natuerliches Scrolling verbessern, nie dagegen kaempfen. |
| **Uebermaessig komplexe Nav-Animationen** | Aufwendige Nav-Transitions die Content-Zugang verzoegern. User wollen schnell Infos finden. | Cleane, schnelle Navigation. Subtile Open/Close Transitions (max 200-300ms). |
| **Pop-ups und Overlays beim Laden** | Newsletter-Pop-ups, Cookie-Walls die Content verdecken. Unterbrechen das visuelle Erlebnis. | Minimaler, nicht-aufdringlicher Cookie-Hinweis. Keine Entry-Pop-ups. |
| **Sound-Effekte bei Interaktion** | Nervt 99% der User. Autoplay-Audio ist ein UX-Antipattern. | Deezer-Integration fuer Musik (existiert). |
| **Endlos-Scroll/Single-Page** | Schlecht fuer SEO, Navigation, Deep-Linking. Website hat bereits gute Seitenstruktur. | Bestehende Seitenstruktur behalten, jede Seite intern cinematisch gestalten. |

## Feature Dependencies

```
Lenis (smooth scroll) ─────────────┐
                                    ├──> Scroll-triggered reveals (GSAP ScrollTrigger)
Section spacing rhythm ─────────────┘         │
                                              ├──> Parallax depth layers
                                              ├──> Text reveal animations
                                              ├──> Staggered grid animations
                                              └──> Cinematische pinned sections

Mutige Typografie ────────────────────────> Text reveal animations (baut auf Type System auf)

Hover-Feedback ───────────────────────────> Magnetische hover effects (Enhancement der Basis)
                                      ───> Custom cursor (Enhancement der Basis-Interaktion)

prefers-reduced-motion ───────────────────> ALLE Animation-Features (jede Animation muss das pruefen)

Page Transitions ─────────────────────────> Unabhaengig (Next.js View Transitions API oder Framer Motion)

Grain Overlay ────────────────────────────> Unabhaengig (rein CSS, keine Abhaengigkeiten)
```

## MVP Recommendation

**Phase 1 -- Foundation (Table Stakes):**
1. Typografie-Ueberarbeitung (uebergrosse Headlines, fluide Groessen, Spacing)
2. Section-Spacing-Rhythmus (konsistentes grosszuegiges Padding)
3. Scroll-triggered Fade/Slide Reveals (GSAP ScrollTrigger)
4. Hover-Feedback auf allen interaktiven Elementen
5. `prefers-reduced-motion` Support von Tag 1

**Phase 2 -- Tiefe und Bewegung:**
1. Smooth Scroll (Lenis + GSAP Sync)
2. Parallax Depth Layers (nur Desktop)
3. Text Reveal Animationen auf Key-Headlines
4. Staggered Animationen auf Release-Grids
5. Grain Texture Overlay (nur Desktop)
6. Section-Uebergaenge (Gradient-Fades zwischen Sektionen)

**Phase 3 -- Polish und Delight:**
1. Magnetische Hover-Effekte auf CTAs
2. Custom Cursor (nur Desktop)
3. Smooth Page Transitions (View Transitions API wenn stabil, sonst Framer Motion)
4. Farb-/Atmosphaere-Shifts per Section

**Auf unbestimmte Zeit aufschieben:**
- WebGL/Three.js Effekte: Overkill fuer Scope
- Audio-reactive Visuals: Cool aber Aufwand nicht gerechtfertigt
- Aufwendiger Preloader: Kontraproduktiv
- Cinematische Pinned Sections: Hohe Komplexitaet, nur wenn Phase 1+2 sehr gut laufen

## Implementation Notes

### Animation Library: GSAP + ScrollTrigger
- Industrie-Standard fuer scroll-basierte Animationen (Mehrheit der Awwwards-Sites)
- ScrollTrigger Plugin deckt alle scroll-linked Animation Beduerfnisse ab
- Funktioniert mit Lenis Smooth Scroll bei korrekter Sync via GSAP Ticker
- Unterstuetzt `matchMedia` fuer responsive Animation Breakpoints (Mobile deaktivieren)
- **Lizenz:** GSAP ist kostenlos fuer die meisten Anwendungsfaelle. ScrollTrigger ist im Free Tier enthalten. Nur Premium-Plugins (MorphSVG, SplitText offiziell, etc.) brauchen Paid License.
- **SplitText Alternative:** SplitType (Open Source) oder manuelles Span-Wrapping in React

### Smooth Scroll: Lenis
- Leichtgewichtig (~3KB gzip), zweckgebaut fuer Smooth Scroll
- Erstellt von darkroom.engineering (Agentur hinter vielen Awwwards-Gewinnern)
- Sync mit GSAP Ticker: `autoRaf: false` auf Lenis setzen, in `gsap.ticker` einfuegen
- Auf Mobile deaktivieren fuer native Scroll-Performance

### Page Transitions: Next.js View Transitions API
- Next.js 16 unterstuetzt experimentelles `viewTransition: true` in der Config
- Bietet nativen Crossfade zwischen Seiten via Browser View Transitions API
- Browser-Support: Chrome, Edge, Safari 18+. Kein Firefox.
- Fallback: Framer Motion `AnimatePresence` fuer breiteren Support, fuegt aber Bundle Size hinzu
- Empfehlung: Mit View Transitions API starten. Framer Motion Fallback nur wenn Firefox-Support kritisch.

### Mobile Strategie
- Parallax, Grain, Custom Cursor: nur Desktop (`matchMedia` oder Tailwind `md:` Breakpoint)
- Scroll Reveals: einfacher auf Mobile (nur Fade, kein translateX/Y), kuerzere Durations
- Touch Feedback: `:active` States statt `:hover`
- `prefers-reduced-motion`: Alle Animationen in Media Query Check wrappen

## Sources

- [Awwwards Music & Sound Websites](https://www.awwwards.com/websites/music-sound/)
- [GSAP ScrollTrigger Documentation](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [GSAP Scroll Overview](https://gsap.com/scroll/)
- [Lenis Smooth Scroll (GitHub)](https://github.com/darkroomengineering/lenis)
- [Lenis + GSAP Next.js Integration Tutorial](https://devdreaming.com/blogs/nextjs-smooth-scrolling-with-lenis-gsap)
- [Next.js View Transitions Config](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition)
- [Figma Web Design Trends 2026](https://www.figma.com/resource-library/web-design-trends/)
- [CSS-Tricks: Parallax with Scroll-Driven Animations](https://css-tricks.com/bringing-back-parallax-with-scroll-driven-css-animations/)
- [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)
- [Smashing Magazine: Respecting Motion Preferences](https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/)
- [Codrops: 3D Scroll-Driven Text Animations](https://tympanus.net/codrops/2025/11/04/creating-3d-scroll-driven-text-animations-with-css-and-gsap/)
- [Motion.dev: React Scroll Animations](https://motion.dev/docs/react-scroll-animations)
- [Best Band Websites 2026 (PromoHype)](https://www.promohype.com/blog/best-band-websites)
- [Webflow: Parallax Scrolling Guide](https://webflow.com/blog/parallax-scrolling)
- [GSAP Community: Lenis + ScrollTrigger in React/Next](https://gsap.com/community/forums/topic/40426-patterns-for-synchronizing-scrolltrigger-and-lenis-in-reactnext/)
