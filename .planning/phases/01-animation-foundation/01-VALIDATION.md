---
phase: 1
slug: animation-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Kein Test-Framework vorhanden |
| **Config file** | none — kein Setup nötig für Phase 1 (manual-only) |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run build` muss fehlerfrei durchlaufen
- **After every plan wave:** Manuell im Browser prüfen (Desktop + Mobile DevTools)
- **Before `/gsd:verify-work`:** Alle 4 Success Criteria manuell verifiziert
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | ANIM-02 | manual-only | Manuell: Desktop + Mobile Browser | -- | ⬜ pending |
| TBD | 01 | 1 | ANIM-03 | manual-only | Manuell: OS reduced-motion Setting | -- | ⬜ pending |
| TBD | 01 | 1 | ANIM-04 | manual-only | Manuell: Console ScrollTrigger.getAll() | -- | ⬜ pending |
| TBD | 01 | 1 | ANIM-05 | manual-only | Manuell: Mobile DevTools | -- | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — `npm run build` als Smoke-Test reicht für Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lenis Smooth Scroll auf Desktop, nativer Scroll auf Mobile | ANIM-02 | Browser-Verhalten, DOM-basiert | Desktop-Browser: Seite scrollen, butterweicher Scroll. Mobile DevTools: nativer Scroll, kein Lenis |
| `prefers-reduced-motion` deaktiviert alle Animationen | ANIM-03 | OS-Setting + Browser-Verhalten | OS-Setting auf "Reduce Motion", Seite laden, keine Bewegung sichtbar |
| useScrollReveal Hook Cleanup bei Route-Wechsel | ANIM-04 | DOM-Lifecycle, Memory Leak Prüfung | Console: `ScrollTrigger.getAll().length` vor/nach Navigation — sollte 0 sein nach Wechsel |
| Desktop-only Effekte nicht auf Mobile | ANIM-05 | Device-abhängiges Verhalten | Mobile DevTools: keine Parallax/Grain/Cursor-Effekte geladen |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
