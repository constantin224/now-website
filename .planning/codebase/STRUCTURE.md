# Codebase Structure

**Analysis Date:** 2026-03-19

## Directory Layout

```
now-website/
├── app/                          # Next.js app router pages & API routes
│   ├── [locale]/                 # Dynamic locale segment (de, en)
│   │   ├── page.tsx              # Home page
│   │   ├── layout.tsx            # Locale-specific layout (nav, footer, popup)
│   │   ├── about/
│   │   │   └── page.tsx          # About band page
│   │   ├── music/
│   │   │   └── page.tsx          # Releases, discography, videos
│   │   ├── shows/
│   │   │   └── page.tsx          # Concert listing (Bandsintown embed)
│   │   ├── press/
│   │   │   └── page.tsx          # EPK / Press kit page
│   │   └── impressum/
│   │       └── page.tsx          # Legal/imprint page
│   ├── api/
│   │   └── revalidate/
│   │       └── route.ts          # Cache revalidation endpoint (Vercel cron)
│   ├── layout.tsx                # Root layout (fonts, global metadata)
│   ├── robots.ts                 # robots.txt generation
│   └── sitemap.ts                # sitemap.xml generation
├── components/                   # Reusable React components
│   ├── navigation.tsx            # Header nav (desktop/mobile, locale switcher)
│   ├── footer.tsx                # Footer with links and metadata
│   ├── hero-video.tsx            # Landing video hero with load animation
│   ├── new-release-popup.tsx     # Floating popup for new releases
│   ├── spotify-embed.tsx         # Spotify embed frame
│   ├── youtube-facade.tsx        # YouTube iframe with lazy load facade
│   ├── bandsintown-widget.tsx    # Bandsintown shows embed
│   └── social-icons.tsx          # Social media icon components
├── lib/                          # Business logic, utilities, API wrappers
│   ├── i18n.ts                   # Localization: type definitions, message loader
│   ├── deezer.ts                 # Deezer API wrapper: fetches releases
│   └── shows.ts                  # Show filtering: upcoming, past, date formatting
├── data/                         # Static content & type definitions
│   ├── site.ts                   # Site metadata (name, url, contact, label info)
│   ├── releases.ts               # Release & video metadata (manual, also synced from Deezer)
│   ├── social.ts                 # Social media links & icons
│   └── shows.ts                  # Show data (venue, date, ticketing URL)
├── messages/                     # i18n translations (JSON)
│   ├── de.json                   # German translations (all UI strings)
│   └── en.json                   # English translations
├── .planning/
│   └── codebase/                 # GSD codebase documentation
├── public/                       # Static assets (logo, images, videos)
│   ├── logo.png                  # Band logo
│   ├── video.mp4                 # Desktop hero video
│   ├── video-mobile.mp4          # Mobile hero video
│   ├── album-cover-out.jpg       # Album artwork
│   ├── band-photo-*.jpg          # Band photos for pages
│   └── og-image.jpg              # OpenGraph image for social sharing
├── .next/                        # Next.js build output (generated, not committed)
├── .git/                         # Git repository
├── .gitignore                    # Git ignore rules
├── package.json                  # Dependencies, scripts
├── package-lock.json             # Locked dependency versions
├── tsconfig.json                 # TypeScript configuration
├── next.config.ts                # Next.js configuration (image remotes, redirects)
├── middleware.ts                 # Request middleware (locale enforcement)
├── eslint.config.mjs             # ESLint configuration
├── postcss.config.mjs            # PostCSS configuration (Tailwind)
├── tailwind.config.js            # Tailwind CSS configuration
├── .vercel/                      # Vercel deployment config (generated)
└── README.md                     # Project documentation
```

## Directory Purposes

**app/[locale]/**
- Purpose: Locale-prefixed pages (de/, en/) with shared layout
- Contains: Page components, dynamic locale segment, API routes
- Key files: `layout.tsx` (renders Navigation/Footer/popup), page.tsx files (home, music, about, shows, press, impressum)

**components/**
- Purpose: Reusable React UI components (client & server)
- Contains: Presentational components, layout components, embeds, interactive controls
- Key files: `navigation.tsx` (main nav), `hero-video.tsx` (landing), `new-release-popup.tsx` (float popup)

**lib/**
- Purpose: Business logic, data fetching, utilities
- Contains: Type definitions, service functions, helpers
- Key files: `i18n.ts` (localization), `deezer.ts` (release fetching), `shows.ts` (show filtering)

**data/**
- Purpose: Static content, metadata, configuration
- Contains: Exported constants, type definitions, manual content
- Key files: `site.ts` (company info), `releases.ts` (release/video metadata), `social.ts` (social links)

**messages/**
- Purpose: Internationalization (i18n) translations
- Contains: JSON files keyed by locale
- Key files: `de.json` (German), `en.json` (English) — all UI strings

**public/**
- Purpose: Static assets served directly by HTTP
- Contains: Images, videos, logo, OpenGraph assets
- Not versioned (generated in CI or provided separately)

## Key File Locations

**Entry Points:**

- `app/layout.tsx`: Root HTML layout, font loading, global metadata
- `app/[locale]/layout.tsx`: Locale-aware layout, Navigation/Footer/popup rendering
- `middleware.ts`: Request preprocessing, locale enforcement
- `app/api/revalidate/route.ts`: Cache invalidation endpoint

**Configuration:**

- `next.config.ts`: Image remote domains, redirects placeholder
- `tsconfig.json`: TypeScript compiler, path aliases (`@/*`)
- `middleware.ts`: Locale routing rules
- `tailwind.config.js`: Tailwind CSS theme (colors, fonts, animations)
- `package.json`: Dependencies, build/dev/start scripts

**Core Logic:**

- `lib/i18n.ts`: Message loading, locale validation, type definitions
- `lib/deezer.ts`: Deezer API integration, release normalization
- `lib/shows.ts`: Show filtering and date formatting
- `data/site.ts`: Site metadata, company information
- `data/releases.ts`: Release/video metadata (types and data)

**Presentation:**

- `app/[locale]/page.tsx`: Home page (renders HeroVideo)
- `app/[locale]/music/page.tsx`: Releases, discography, videos (fetches from Deezer)
- `app/[locale]/about/page.tsx`: Band biography, band members, social icons
- `app/[locale]/shows/page.tsx`: Concert listing (Bandsintown embed)
- `components/navigation.tsx`: Header with mobile menu, language switcher
- `components/footer.tsx`: Footer with links and metadata
- `components/hero-video.tsx`: Landing video hero with load animation

**Testing:**

- None (no test files in structure)

## Naming Conventions

**Files:**

- Page components: `page.tsx` (app router convention)
- Layout components: `layout.tsx` (app router convention)
- API routes: `route.ts` (app router convention)
- Components: `kebab-case.tsx` (e.g., `hero-video.tsx`, `new-release-popup.tsx`)
- Libraries: `kebab-case.ts` (e.g., `deezer.ts`, `shows.ts`)
- Data files: `kebab-case.ts` or simple names (e.g., `social.ts`, `releases.ts`)

**Directories:**

- Dynamic segments: Wrapped in brackets (e.g., `[locale]`, `[id]` if used)
- Feature directories: lowercase, flat structure under app/ (e.g., `music/`, `shows/`)
- Internal logic: `lib/` (lowercase)
- Static data: `data/` (lowercase)
- Translations: `messages/` (lowercase)
- UI Components: `components/` (lowercase)

**TypeScript:**

- Types: PascalCase (e.g., `LatestRelease`, `DeezerRelease`, `Show`)
- Functions: camelCase (e.g., `getMessages()`, `getAllReleases()`, `getUpcomingShows()`)
- Variables: camelCase (e.g., `locale`, `featured`, `allReleases`)
- Constants: PascalCase for component exports, camelCase for module constants

## Where to Add New Code

**New Feature (e.g., Gallery, Merch Store):**

1. Create page directory: `app/[locale]/gallery/page.tsx`
2. Create component if needed: `components/gallery-grid.tsx`
3. If fetching data: `lib/gallery.ts` for fetching/filtering
4. If static content: `data/gallery.ts` for metadata
5. Add translations: Keys in `messages/de.json` and `messages/en.json`
6. Add nav link: Update `navLinks` array in `components/navigation.tsx`

**New Component (e.g., Card, Button, Modal):**

1. Create file: `components/my-component.tsx`
2. If client-only: Add `"use client"` directive at top
3. Export as default function or named export
4. Use Tailwind for styling (no CSS modules)
5. If nested: Can be subdirectory `components/cards/release-card.tsx`

**New Utility (e.g., Date Formatter, Cache Manager):**

1. Create file: `lib/my-util.ts`
2. Export functions/types
3. Import in components/pages as needed

**New Static Content (e.g., Testimonials, Team Members):**

1. Create file: `data/testimonials.ts`
2. Define TypeScript type: `export type Testimonial = { ... }`
3. Export array: `export const testimonials: Testimonial[] = [...]`
4. Import in component: `import { testimonials } from "@/data/testimonials"`

**Translations:**

1. Add key to `messages/de.json` (German)
2. Add key to `messages/en.json` (English) — must have same structure
3. Access in component: `const t = getMessages(locale); t.section.key`

## Special Directories

**node_modules/**
- Purpose: npm packages
- Generated: Yes
- Committed: No (in .gitignore)

**.next/**
- Purpose: Next.js build output, type definitions, dev server
- Generated: Yes (by `npm run build` or `npm run dev`)
- Committed: No (in .gitignore)

**.vercel/**
- Purpose: Vercel deployment metadata
- Generated: Yes (by Vercel CLI/dashboard)
- Committed: No

**.git/**
- Purpose: Git repository
- Generated: Yes
- Committed: Yes

**public/**
- Purpose: Static assets (images, videos, documents)
- Generated: Mostly no (except in build pipeline)
- Committed: Yes

## Routing Overview

**Locale-Based Routes:**

- `/de` → German homepage
- `/en` → English homepage
- `/de/about`, `/en/about` → About page
- `/de/music`, `/en/music` → Music/releases page
- `/de/shows`, `/en/shows` → Shows page
- `/de/press`, `/en/press` → Press/EPK page
- `/de/impressum`, `/en/impressum` → Legal page

**API Routes:**

- `/api/revalidate` → POST endpoint for cache invalidation (Vercel cron)

**Automatic Routes:**

- `/robots.txt` → Generated from `app/robots.ts`
- `/sitemap.xml` → Generated from `app/sitemap.ts`

**Middleware Behavior:**

- Requests to `/about` redirected to `/de/about` (if locale missing)
- Requests to `/de/about`, `/en/about` pass through unchanged
- Static files (`.jpg`, `.mp4`, etc.) bypass middleware
- API routes pass through unchanged

---

*Structure analysis: 2026-03-19*
