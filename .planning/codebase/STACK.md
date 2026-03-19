# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- TypeScript 5 - All source files (.ts, .tsx)

**Secondary:**
- JavaScript (ES2017 target) - Build output, configuration files (.mjs)

## Runtime

**Environment:**
- Node.js - Package manager and build runtime

**Package Manager:**
- npm - Lock file: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- Next.js 16.1.7 - Full-stack React framework for pages, routing, API routes
  - App Router - Modern routing paradigm with file-based routes
  - Middleware - Locale/i18n routing in `middleware.ts`
  - Image Optimization - Remote patterns configured for Deezer and CDN images
  - Caching/Revalidation - ISR with 1-hour cache on Deezer API calls

**UI & Styling:**
- React 19.2.3 - Core UI library
- Tailwind CSS 4 - Utility-first CSS framework
  - @tailwindcss/postcss 4 - PostCSS plugin for Tailwind v4
- lucide-react 0.577.0 - Icon library (used in footer, navigation, buttons)

**Testing:**
- Not detected

**Build/Dev:**
- TypeScript 5 - Type checking and compilation
- PostCSS 4 - CSS processing via `postcss.config.mjs`
- ESLint 9 - Code linting via `eslint.config.mjs`
  - eslint-config-next 16.1.7 - Next.js recommended ESLint rules
  - Core Web Vitals preset
  - TypeScript preset

## Key Dependencies

**Critical:**
- next (16.1.7) - Full framework for SSR/SSG, API routes, middleware
- react (19.2.3) - UI rendering
- react-dom (19.2.3) - DOM rendering
- tailwindcss (4) - Styling system

**UI & Icons:**
- lucide-react (0.577.0) - React icon components used in `components/social-icons.tsx`

**Type Safety:**
- @types/node (^20) - Node.js type definitions
- @types/react (^19) - React type definitions
- @types/react-dom (^19) - React DOM type definitions

## Configuration

**Environment:**
- Environment variables reference: `process.env.CRON_SECRET` (required)
- No .env file present - uses Vercel environment variables
- Locale support: German (de) default, English (en) fallback in `lib/i18n.ts`

**Build:**
- `next.config.ts` - Next.js configuration
  - Image remote patterns: Deezer CDN (cdn-images.dzcdn.net, e-cdns-images.dzcdn.net, api.deezer.com)
  - Redirects: Placeholder for WordPress URL migrations (currently empty)
- `tsconfig.json` - TypeScript compiler options
  - Target: ES2017
  - Module resolution: bundler
  - Path alias: `@/*` → current directory root
  - Strict mode: enabled
- `postcss.config.mjs` - PostCSS configuration for Tailwind
- `eslint.config.mjs` - ESLint flat config format with Next.js presets

## Platform Requirements

**Development:**
- Node.js (version not pinned in repo, managed by npm)
- npm 8+ (for lockfileVersion 3)

**Production:**
- Deployment platform: Vercel
  - Cron support: Daily job at 06:00 UTC (`vercel.json`)
  - Cron authentication: Bearer token via `CRON_SECRET` environment variable
  - Automatic builds from git pushes
  - Edge function compatible (middleware runs on Vercel Edge Network)

## Runtime Behavior

**Cache Strategy:**
- Deezer API calls: ISR with 1-hour cache (`{ next: { revalidate: 3600 } }`)
- Cache revalidation: Daily via Vercel Cron → `/api/revalidate` endpoint
- Revalidate scope: All layout-scoped routes `revalidatePath("/[locale]", "layout")`

**i18n Routing:**
- Middleware redirects root (/) to default locale (/de)
- Supports: /de/*, /en/*
- Messages loaded from JSON files in `messages/` directory

---

*Stack analysis: 2026-03-19*
