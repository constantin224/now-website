# Now. Website — Premium Visual Upgrade

## What This Is

Eine bestehende Next.js Band-Website für "Now." (Pop-Rock-Trio aus Wien, Tonherd Music), die visuell auf das Level großer internationaler Artist-Websites gehoben werden soll. Die Seite hat bereits eine solide Basis — jetzt kommt das cinematische, professionelle Finish mit Animationen, besserer Typografie, visueller Tiefe und Micro-Interactions.

## Core Value

Die Website muss sich anfühlen wie die Homepage eines international etablierten Acts — smooth, cinematisch, mit Liebe zum Detail — und dabei auf Mobile einwandfrei performen.

## Requirements

### Validated

<!-- Bestehendes, das funktioniert und bleibt -->

- ✓ Hero-Video mit Popup-Player — existing
- ✓ Zweisprachigkeit DE/EN mit Locale-Routing — existing
- ✓ Farbschema und Branding — existing
- ✓ Logo und visuelle Identität — existing
- ✓ Deezer-Integration für Releases — existing
- ✓ Bandsintown-Integration für Shows — existing
- ✓ Responsive Layout — existing
- ✓ Vercel Deployment mit ISR — existing

### Active

<!-- Neuer Scope: Premium Visual Upgrade -->

- [ ] Smooth Page/Section Transitions und Scroll-Animationen
- [ ] Überarbeitete Typografie mit mutigeren Headlines und besserem Spacing
- [ ] Visuelle Tiefe durch Parallax, Layering und cinematische Elemente
- [ ] Micro-Interactions (Cursor-Effekte, Button-Feedback, Hover-States)
- [ ] Überarbeitete Seitenstruktur und Content-Flow für besseren Gesamteindruck
- [ ] Mobile-first Performance — Effekte auf Mobile reduziert/deaktiviert
- [ ] Referenz-Research: Top-Artist-Websites analysieren und Best Practices übernehmen

### Out of Scope

- Neues Farbschema — aktuelles bleibt
- Logo-Redesign — Branding bleibt
- Backend-Änderungen — Deezer/Bandsintown-Integration bleibt wie sie ist
- Neuer Content (Texte, Fotos) — Upgrade nutzt bestehenden Content
- E-Commerce/Merch-Shop — nicht Teil dieses Upgrades
- CMS-Integration — bleibt statisch/API-basiert

## Context

- **Bestehende Website:** Next.js 16, React 19, Tailwind CSS 4, TypeScript, Vercel
- **Aktuelle Sektionen:** Hero (Video), Releases (Deezer), Shows (Bandsintown), About, Footer
- **Codebase-Map:** Vollständig in `.planning/codebase/` dokumentiert (7 Dokumente)
- **Bekannte Concerns:** Einige hardcoded Strings, fehlende Tests, Performance-Optimierungspotenzial (siehe CONCERNS.md)
- **Feedback aus früheren Arbeiten:** Parallax/Scale/Fade nur auf Desktop; Mobile statisch; CSS-only Snap; Minimum Text-Opacity 35%

## Constraints

- **Mobile Performance:** Animationen/Effekte müssen auf Mobile reduziert oder deaktiviert werden — Mobile first
- **Bestehendes Branding:** Farbschema, Logo, Hero-Video-Popup müssen erhalten bleiben
- **Tech Stack:** Next.js/React/Tailwind bleiben — keine Framework-Migration
- **Deployment:** Vercel bleibt Plattform — kein Self-Hosting
- **Zweisprachigkeit:** DE/EN muss weiterhin funktionieren

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hero-Sektion bleibt unverändert | User findet sie "super", kein Handlungsbedarf | ✓ Good |
| Mobile first Approach | Hauptnutzung auf Mobile, Desktop-Effekte als Enhancement | — Pending |
| Artist-Website-Research vor Implementation | Best Practices von Top-Acts als Grundlage, nicht Bauchgefühl | — Pending |

---
*Last updated: 2026-03-19 after initialization*
