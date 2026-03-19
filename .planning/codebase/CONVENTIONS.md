# Coding Conventions

**Analysis Date:** 2026-03-19

## Naming Patterns

**Files:**
- kebab-case for component and utility files: `new-release-popup.tsx`, `youtube-facade.tsx`, `social-icons.tsx`
- camelCase for data and library files: `deezer.ts`, `shows.ts`, `social.ts`, `site.ts`
- Named exports for utility/data files: `getMessages()`, `getLatestRelease()`, `getUpcomingShows()`
- Default export for React components: `export default function Navigation()`

**Functions:**
- camelCase for all functions: `getMessages()`, `getLatestRelease()`, `getUpcomingShows()`, `formatShowDate()`
- Async functions clearly named: `getLatestRelease()`, `getAllReleases()` with async/await
- Handler functions prefixed with handle: `handleScroll`, `handleError` (observed in navigation)
- Getters and filters use verb-first: `getMessages()`, `getPastShows()`, `isValidLocale()`

**Variables:**
- camelCase for all variables: `scrolled`, `menuOpen`, `navLinks`, `latestRelease`
- Boolean variables use present tense: `scrolled`, `menuOpen`, `visible`, `playing`
- Constants in UPPER_SNAKE_CASE: `ARTIST_ID`, `STORAGE_KEY`, `DEFAULT_LOCALE`
- Const assertions for type inference: `const locales = ["de", "en"] as const`

**Types:**
- PascalCase for all types: `LatestRelease`, `DeezerRelease`, `Locale`, `Show`, `SocialPlatform`
- Component prop types inline or suffixed with `Props`: `YouTubeFacadeProps`, `IconProps`
- Type imports explicitly: `import type { Metadata } from "next"`
- Readonly modifiers on component props: `Readonly<{ children: React.ReactNode }>`

## Code Style

**Formatting:**
- No explicit formatter configured (ESLint handles it)
- 2-space indentation (inferred from codebase)
- Trailing commas in multi-line structures
- Semicolons on all statements

**Linting:**
- ESLint v9 with Next.js core-web-vitals and TypeScript configs
- Config: `eslint.config.mjs` (flat config format)
- Uses `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- No custom rules observed beyond Next.js defaults

**File Organization:**
- Imports grouped: Next.js internals, React, third-party packages, local imports
- Type imports separated: `import type { Locale } from "@/lib/i18n"`
- React client directive on first line when needed: `"use client"`

## Import Organization

**Order:**
1. Next.js imports (from "next", "next/font", "next/image", "next/navigation")
2. React imports (useState, useEffect, etc.)
3. Third-party packages (lucide-react, others)
4. Local imports with @ alias (from "@/")
5. Type imports always use explicit `import type`

**Path Aliases:**
- `@/*` maps to project root (configured in `tsconfig.json`)
- Used consistently: `@/lib/i18n`, `@/components/`, `@/data/`, `@/app/`
- No relative imports observed; always use @ alias

## Error Handling

**Patterns:**
- Try-catch blocks in async functions that call external APIs
- Silent failures with fallback returns:
  - `catch { return [] }` in `getAllReleases()`
  - `catch { return null }` in `getLatestRelease()`
- No error logging or error boundaries implemented
- HTTP status checks before parsing: `if (!res.ok) return []`
- Early returns for validation: `if (!isValidLocale(locale)) notFound()`

**Null/Undefined Handling:**
- Optional chaining not heavily used
- Type guards with `as const` assertions: `locale as Locale`
- Nullish coalescing for defaults: `messages[locale] || messages[defaultLocale]`
- Array length checks before access: `if (!albums || albums.length === 0) return null`

## Logging

**Framework:** console (not explicitly used)

**Patterns:**
- No console logging observed in the codebase
- Comments used instead for inline explanation: German comments throughout
- Comments explain the "why" not the "what"
- Example: `// Locale-Prefix ermitteln`, `// Body-Scroll sperren wenn Mobile-Menü offen`

## Comments

**When to Comment:**
- Comments explain business logic and intent, not obvious code
- All comments in German (matching project language)
- Comments placed above code they describe

**Examples:**
- `// Aktuellen Pfad ohne Locale-Prefix ermitteln` (explains logic before regex)
- `// Stündlich Cache, wird via Cron täglich revalidiert` (cache strategy explanation)
- `// Deezer Artist ID für Now.` (constant context)
- `// Icon-Mapping: social.ts icon-String → Brand-SVG-Komponente` (data structure documentation)

## Function Design

**Size:** Functions are small and focused
- Utility functions 5-20 lines
- Components under 200 lines with clear internal structure
- Complex logic broken into smaller named functions

**Parameters:**
- Type annotations required on all parameters
- Destructured when possible: `{ locale, children, params }`
- Props typing with type definitions or inline
- Optional parameters with defaults: `limit = 20`

**Return Values:**
- Explicit return types on all functions
- Async functions return Promise-wrapped types
- Early returns for error/validation cases
- Union types for multiple possibilities: `Promise<LatestRelease | null>`

## Module Design

**Exports:**
- Single default export for React components
- Named exports for utilities and data
- Type exports with `export type` keyword
- Barrel files not used (direct imports preferred)

**Public API:**
- Library files export both types and functions: `lib/i18n.ts` exports `Locale`, `getMessages()`, `isValidLocale()`
- Data files export types and constants: `data/shows.ts` exports `Show` type and `shows` array
- Component files export only the component

## React-Specific Patterns

**Hooks:**
- `useState` for simple state: `[scrolled, setScrolled]`, `[menuOpen, setMenuOpen]`
- `useEffect` for side effects with cleanup
- `usePathname` and `useRouter` from Next.js navigation
- No custom hooks observed

**Client Components:**
- "use client" directive used minimally
- Only interactive components need it: `navigation.tsx`, `new-release-popup.tsx`, `youtube-facade.tsx`
- Most components are server-rendered

**Prop Drilling:**
- Props passed down for locale switching
- Translation function obtained via `getMessages(locale)` in each component
- No prop drilling depth issues observed

## Tailwind CSS

**Usage:**
- Utility-first approach with inline Tailwind classes
- Custom color tokens: `bg-bg-base`, `text-terracotta`, `text-sand`, `text-sand-38`, `border-line`
- Responsive classes for mobile/desktop: `hidden md:block`, `md:flex`
- Animation utilities: `animate-slide-up` (custom defined in config)
- No CSS modules observed

## Next.js Specific

**App Router:**
- File-based routing with `[locale]` dynamic segments
- Parallel layouts: root `layout.tsx` and `[locale]/layout.tsx`
- Metadata API for SEO: `export const metadata: Metadata`
- Static generation with `generateStaticParams()`

**Server Components:**
- Async server components with `async function`
- Data fetching in layouts: `getLatestRelease()` called in `[locale]/layout.tsx`
- Revalidation with `next: { revalidate: 3600 }`
- ISR (Incremental Static Regeneration) via API route at `/api/revalidate`

**Middleware:**
- Locale detection and redirection in `middleware.ts`
- Exports `middleware` function and `config` object with matcher
- No authentication middleware observed

---

*Convention analysis: 2026-03-19*
