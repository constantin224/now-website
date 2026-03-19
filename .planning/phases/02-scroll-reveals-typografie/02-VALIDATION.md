---
phase: 2
slug: scroll-reveals-typografie
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Kein Test-Framework vorhanden |
| **Config file** | none |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run build` muss fehlerfrei durchlaufen
- **After every plan wave:** `npm run build && npm run lint`
- **Before `/gsd:verify-work`:** Build green + visuelle Prüfung aller Seiten
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | TYPO-01 | manual | Browser-Resize 320px-1920px | -- | ⬜ pending |
| TBD | 01 | 1 | TYPO-02 | manual | Visuell: gleichmäßige Abstände | -- | ⬜ pending |
| TBD | 01 | 1 | TYPO-03 | manual | DevTools CSS inspection | -- | ⬜ pending |
| TBD | 01 | 1 | TYPO-04 | smoke | npm run build + Lighthouse CLS | -- | ⬜ pending |
| TBD | 02 | 1 | ANIM-01 | manual | Visuell: Sektionen faden ein | -- | ⬜ pending |
| TBD | 03 | 2 | STRUC-01 | manual | Visuell: Content-Flow | -- | ⬜ pending |
| TBD | 03 | 2 | STRUC-02 | manual | Visuell: Full-Bleed Sektion | -- | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Kein Test-Framework nötig — `npm run build` als Smoke-Test reicht für Phase 2.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scroll Reveals auf allen Sektionen | ANIM-01 | Browser-Animation | Alle Seiten durchscrollen, Content faded ein |
| Übergroße fluide Headlines | TYPO-01 | Visuelle Prüfung | Browser-Resize 320px bis 1920px |
| Konsistentes Section-Spacing | TYPO-02 | Visuelle Prüfung | Abstände zwischen Sektionen gleichmäßig |
| Letter-Spacing/Line-Height | TYPO-03 | Visuelle Prüfung | DevTools CSS inspection |
| CLS-freies Font-Loading | TYPO-04 | Lighthouse | npm run build + Lighthouse CLS < 0.05 |
| Content-Flow überarbeitet | STRUC-01 | Visuelle Prüfung | Seitenstruktur wirkt durchdacht |
| Full-Bleed Sektion | STRUC-02 | Visuelle Prüfung | Mind. eine Edge-to-Edge Sektion außerhalb Hero |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
