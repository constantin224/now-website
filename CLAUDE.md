# now-website — Projekt-Regeln

Next.js (App Router) + Tailwind + GSAP/Lenis, Prod auf Vercel (now-music.at); `vercel.json`-Cron ruft täglich `/api/revalidate`.
Deploy: NUR manuell — Skill `tonherd-web-deploy` (`~/.claude/skills/tonherd-web-deploy/SKILL.md`) verwenden; `git push` deployt NICHT.

## Design-Hausregeln

- **Parallax/Scale/Fade nur Desktop (≥768px), Mobile statisch** — Mobile ist Performance-Bottleneck; große Blurs, Grain-Overlays und backdrop-blur auf Mobile aus; `prefers-reduced-motion` respektieren.
- **Touch-Events immer `passive: true` + `touch-action: pan-y`**; nie `passive: false` (blockiert den Scroll-Thread).
- **Mobile-Nav-Overlay via `createPortal(…, document.body)`** — nie als Nav-Child (CSS `transform` auf Nav bricht sonst `position: fixed` des Overlays).
- **Falls Scroll-Snap:** CSS-only (`mandatory`, nur Desktop, Footer als Snap-Ziel), KEIN JS-Snapping.
- **Falls Kontaktformular:** eigene API-Route + nodemailer/Gmail SMTP, KEIN Formspree/Drittanbieter; Spam-Schutz = Honeypot + Rate-Limit + Turnstile.
- **Text-Lesbarkeit:** Text-Opacity nie unter 35%, klare Hierarchie (Primär 50–80%, Sekundär 40–45%).

Detail/Begründung: Memory-Files `feedback_*` unter `~/.claude/projects/-Users-constantinkaiser-claude-projects/memory/`.
