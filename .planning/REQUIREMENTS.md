# Requirements: Now. Website Premium Visual Upgrade

**Defined:** 2026-03-19
**Core Value:** Die Website muss sich anfühlen wie die Homepage eines international etablierten Acts — smooth, cinematisch, mit Liebe zum Detail — und dabei auf Mobile einwandfrei performen.

## v1 Requirements

Requirements für das Premium Visual Upgrade. Jede mapped zu einer Roadmap-Phase.

### Animation Foundation

- [ ] **ANIM-01**: Scroll-triggered Fade/Slide Reveals auf allen Content-Sektionen mit GSAP ScrollTrigger
- [x] **ANIM-02**: Smooth Scroll via Lenis mit korrektem GSAP Ticker Sync (Desktop only, Mobile native)
- [ ] **ANIM-03**: `prefers-reduced-motion` Support — alle Animationen respektieren User-Einstellung
- [ ] **ANIM-04**: useScrollReveal Hook mit IntersectionObserver/ScrollTrigger und automatischem Cleanup via useGSAP
- [x] **ANIM-05**: Mobile Guard — Parallax, Grain, Cursor-Effekte nur auf Desktop via matchMedia

### Typografie & Spacing

- [ ] **TYPO-01**: Überarbeitete Headlines — mutige, übergroße Typografie mit `clamp()` für fluide Größen
- [ ] **TYPO-02**: Konsistenter Section-Spacing-Rhythmus mit Design Tokens (großzügiges Padding)
- [ ] **TYPO-03**: Verfeinertes Letter-Spacing und Line-Height System für bessere Lesbarkeit
- [ ] **TYPO-04**: `next/font` Integration mit size-adjust für CLS-freies Font-Loading

### Interaktion & Hover

- [ ] **INTX-01**: Hover-Feedback auf allen interaktiven Elementen (Buttons, Links, Cards) mit CSS Transitions
- [ ] **INTX-02**: Magnetische Hover-Effekte auf primären CTAs (Cursor-Following, subtiler Transform, nur Desktop)
- [ ] **INTX-03**: Custom Cursor der sich auf Hover verändert (Kreis auf Video, Grow auf CTAs, nur Desktop)

### Visuelle Tiefe

- [ ] **DPTH-01**: Parallax Depth Layers auf ausgewählten Sektionen (unterschiedliche Scroll-Geschwindigkeiten, nur Desktop)
- [ ] **DPTH-02**: Staggered Grid Animationen auf Release-Cards und ähnlichen Grid-Layouts
- [ ] **DPTH-03**: Grain/Noise Texture Overlay auf dunklen Sektionen (Film-Look, nur Desktop)
- [ ] **DPTH-04**: Section-Übergänge mit Gradient-Fades zwischen Sektionen statt harter Grenzen

### Page Transitions

- [ ] **PAGE-01**: Smooth Page Transitions zwischen allen Seiten (Crossfade/Slide statt harter Cut)
- [ ] **PAGE-02**: View Transitions API nutzen wenn stabil, sonst Fallback-Lösung

### Seitenstruktur

- [ ] **STRUC-01**: Überarbeiteter Content-Flow — Sektionsreihenfolge und -gewichtung für besseren Gesamteindruck
- [ ] **STRUC-02**: Full-bleed Momente auch außerhalb des Hero (Edge-to-Edge Sektionen)

## v2 Requirements

Deferred für zukünftige Releases.

### Advanced Animation

- **ADV-01**: Cinematische Pinned Sections (ScrollTrigger pin + animate + release)
- **ADV-02**: Text Reveal Animationen (Headline Wort-für-Wort oder Zeile-für-Zeile Reveals)
- **ADV-03**: Farb-/Atmosphäre-Shifts per Section beim Scrollen

### Performance

- **PERF-01**: Hero-Loader Optimierung (aktuell 4.5s max — LCP-Blocker)
- **PERF-02**: Animation Performance Monitoring (Core Web Vitals Tracking)

## Out of Scope

| Feature | Reason |
|---------|--------|
| WebGL/Three.js Effekte | Overkill für Band-Website, riesige Bundle-Size, GPU-Drain |
| Auto-Play Audio | Universell verhasst, Browser blockieren es |
| Aufwendiger Preloader/Intro | User springen ab bei 2-3s Wartezeit |
| Scroll Hijacking | Verwirrt User, hohe Bounce Rate |
| Infinite Scroll | Schlecht für Band-Site mit klaren Sektionen |
| Neues Farbschema | Bestehendes bleibt (User-Entscheidung) |
| Logo-Redesign | Branding bleibt (User-Entscheidung) |
| Backend-Änderungen | Deezer/Bandsintown-Integration bleibt |
| Neuer Content | Upgrade nutzt bestehenden Content |
| E-Commerce/Merch-Shop | Nicht Teil dieses Upgrades |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ANIM-01 | Phase 2 | Pending |
| ANIM-02 | Phase 1 | Complete |
| ANIM-03 | Phase 1 | Pending |
| ANIM-04 | Phase 1 | Pending |
| ANIM-05 | Phase 1 | Complete |
| TYPO-01 | Phase 2 | Pending |
| TYPO-02 | Phase 2 | Pending |
| TYPO-03 | Phase 2 | Pending |
| TYPO-04 | Phase 2 | Pending |
| INTX-01 | Phase 4 | Pending |
| INTX-02 | Phase 4 | Pending |
| INTX-03 | Phase 4 | Pending |
| DPTH-01 | Phase 3 | Pending |
| DPTH-02 | Phase 3 | Pending |
| DPTH-03 | Phase 3 | Pending |
| DPTH-04 | Phase 3 | Pending |
| PAGE-01 | Phase 4 | Pending |
| PAGE-02 | Phase 4 | Pending |
| STRUC-01 | Phase 2 | Pending |
| STRUC-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after roadmap creation*
