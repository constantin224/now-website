# Roadmap: Now. Website Premium Visual Upgrade

## Overview

Die bestehende Now.-Website wird in 4 Phasen zum cinematischen Premium-Erlebnis ausgebaut. Zuerst wird die Animation-Infrastruktur (GSAP + Lenis) aufgesetzt, dann kommen Scroll-Reveals und die Typografie-Ueberarbeitung als groesster visueller Impact, gefolgt von visueller Tiefe (Parallax, Staggered Grids, Grain) und zuletzt der Feinschliff mit Micro-Interactions und Page Transitions.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Animation Foundation** - GSAP + Lenis Setup, Mobile Guard, Accessibility, Core Hooks
- [ ] **Phase 2: Scroll Reveals & Typografie** - Section-Reveals, Typografie-Overhaul, Content-Flow und Spacing
- [ ] **Phase 3: Visuelle Tiefe** - Parallax, Staggered Grids, Grain Overlay, Section-Uebergaenge
- [ ] **Phase 4: Polish & Delight** - Hover-Feedback, Magnetic Buttons, Custom Cursor, Page Transitions

## Phase Details

### Phase 1: Animation Foundation
**Goal**: Die gesamte Animation-Infrastruktur steht und ist bereit fuer alle weiteren Phasen -- GSAP + Lenis laufen korrekt, Mobile ist geschuetzt, Accessibility ist gewaehrleistet
**Depends on**: Nothing (first phase)
**Requirements**: ANIM-02, ANIM-03, ANIM-04, ANIM-05
**Success Criteria** (what must be TRUE):
  1. Smooth Scroll laeuft auf Desktop fluessig, auf Mobile wird nativer Scroll verwendet
  2. User mit `prefers-reduced-motion` sieht keine Animationen -- Seite funktioniert statisch einwandfrei
  3. Parallax, Grain und Cursor-Effekte werden auf Mobile/Touch-Geraeten nicht geladen oder ausgefuehrt
  4. Ein wiederverwendbarer Scroll-Reveal-Hook existiert und raeumt bei Route-Wechsel sauber auf (kein Memory Leak)
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — GSAP + Lenis Infrastruktur, SmoothScrollProvider, Layout-Integration
- [ ] 01-02-PLAN.md — useScrollReveal Hook, Media-Query Utilities, manuelle Verifikation

### Phase 2: Scroll Reveals & Typografie
**Goal**: Jede Sektion der Website erscheint beim Scrollen mit einer smooth Animation, die Typografie wirkt mutig und professionell, und der Content-Flow fuehlt sich durchdacht an
**Depends on**: Phase 1
**Requirements**: ANIM-01, TYPO-01, TYPO-02, TYPO-03, TYPO-04, STRUC-01, STRUC-02
**Success Criteria** (what must be TRUE):
  1. Alle Content-Sektionen faden/sliden beim Scrollen sichtbar ein -- kein Content erscheint abrupt
  2. Headlines sind uebergross und mutig mit fluiden Groessen die von Mobile bis Desktop sauber skalieren
  3. Sections haben grosszuegiges, konsistentes Spacing mit einem erkennbaren vertikalen Rhythmus
  4. Font-Loading verursacht keinen sichtbaren Layout Shift (CLS nahe 0)
  5. Es gibt mindestens eine Full-Bleed-Sektion ausserhalb des Hero die Edge-to-Edge laeuft
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Visuelle Tiefe
**Goal**: Die Website bekommt cinematische Tiefe durch Parallax-Ebenen, gestaffelte Grid-Animationen, Film-Grain und weiche Section-Uebergaenge
**Depends on**: Phase 2
**Requirements**: DPTH-01, DPTH-02, DPTH-03, DPTH-04
**Success Criteria** (what must be TRUE):
  1. Beim Scrollen auf Desktop bewegen sich Hintergrund-Elemente langsamer als Vordergrund -- sichtbarer Parallax-Effekt
  2. Release-Cards und Grid-Elemente erscheinen nacheinander gestaffelt statt alle gleichzeitig
  3. Dunkle Sektionen haben ein subtiles Film-Grain-Overlay das sich bewegt (nur Desktop)
  4. Sektionsuebergaenge sind weich mit Gradient-Fades statt harter Kanten
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Polish & Delight
**Goal**: Micro-Interactions und Page Transitions heben die Website auf Awwwards-Level -- jedes interaktive Element gibt Feedback, der Cursor reagiert, Seitenwechsel sind smooth
**Depends on**: Phase 3
**Requirements**: INTX-01, INTX-02, INTX-03, PAGE-01, PAGE-02
**Success Criteria** (what must be TRUE):
  1. Alle Buttons, Links und Cards zeigen sichtbares Hover-Feedback (Farbe, Scale oder Transform)
  2. Primaere CTAs haben einen magnetischen Effekt -- der Button folgt dem Cursor leicht (nur Desktop)
  3. Der Cursor veraendert sich kontextabhaengig (z.B. Kreis auf Video, Grow auf CTAs, nur Desktop)
  4. Navigation zwischen Seiten zeigt einen smooth Uebergang statt hartem Cut
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Animation Foundation | 0/2 | Not started | - |
| 2. Scroll Reveals & Typografie | 0/3 | Not started | - |
| 3. Visuelle Tiefe | 0/2 | Not started | - |
| 4. Polish & Delight | 0/2 | Not started | - |
