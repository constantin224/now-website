# Architecture

**Analysis Date:** 2026-03-19

## Pattern Overview

**Overall:** Next.js App Router (Server + Client Components) with Static Generation and On-Demand Revalidation

**Key Characteristics:**
- Server-rendered page layouts with async data fetching
- Client components for interactivity (navigation, popups, video control)
- Static generation at build time with ISR (Incremental Static Regeneration)
- API route for cron-triggered cache invalidation
- Internationalization (i18n) at routing level via locale dynamic segment
- External API integration (Deezer for releases, Bandsintown for shows)

## Layers

**Presentation Layer (Pages & Components):**
- Purpose: Render UI, handle user interactions, display content
- Location: `app/[locale]/`, `components/`
- Contains: Page components (async), Client components (use client), Layout wrappers
- Depends on: `lib/i18n`, `lib/deezer`, `lib/shows`, `data/`, messaging files
- Used by: Next.js router, middleware

**Data & Logic Layer (Libraries & Services):**
- Purpose: Data fetching, business logic, utilities
- Location: `lib/`, `data/`
- Contains: Type definitions, fetch wrappers (Deezer API), i18n utilities, show filtering
- Depends on: External APIs (Deezer), static JSON files (messages, site config)
- Used by: Page components, client components

**Layout Layer (Root & Locale Layouts):**
- Purpose: Shared structure, font loading, global providers
- Location: `app/layout.tsx`, `app/[locale]/layout.tsx`
- Contains: HTML structure, navigation, footer, metadata, font configuration
- Depends on: Navigation, Footer components; i18n validation
- Used by: All page components

**API Layer:**
- Purpose: Server endpoints for cache management
- Location: `app/api/`
- Contains: ISR revalidation endpoint (GET /api/revalidate)
- Depends on: Next.js cache API
- Used by: Vercel cron jobs (external trigger)

**Configuration Layer:**
- Purpose: Settings, type definitions, message translations
- Location: `data/`, `messages/`, `next.config.ts`, `middleware.ts`
- Contains: Site metadata, social links, show data, release metadata, translation files (JSON)
- Depends on: Nothing (static)
- Used by: All layers

## Data Flow

**Page Render Flow (Server):**

1. Request arrives at middleware
2. Middleware checks/enforces locale prefix (en/de)
3. Next.js routes to `app/[locale]/page.tsx` or specific page
4. Page component awaits `params` promise
5. Page extracts locale and calls `getMessages(locale)` from `lib/i18n.ts`
6. For dynamic content (e.g., music page): calls `getAllReleases()` from `lib/deezer.ts`
7. Deezer API fetches latest releases (with 1-hour cache via `next: { revalidate: 3600 }`)
8. Page renders with fetched data
9. Layout components (Navigation, Footer) render using same locale
10. HTML sent to client with serialized props

**Revalidation Flow:**

1. Vercel cron job (configured externally) calls `/api/revalidate` with Bearer token
2. Route validates `CRON_SECRET` env var
3. `revalidatePath("[locale]", "layout")` clears cache for all locale paths
4. Subsequent requests re-fetch from Deezer API
5. New release popup queries Deezer on next page load

**Client Interaction Flow:**

1. Client component (HeroVideo, Navigation, NewReleasePopup) mounts
2. State initialized (e.g., scroll position, menu open, mute state)
3. Event listeners attached (scroll, resize, video events)
4. User interaction triggers state update
5. Component re-renders with new visual state
6. Animations/transitions apply (Tailwind classes)

**Internationalization Flow:**

1. Middleware strips locale from URL and validates it
2. `isValidLocale()` guards against invalid locales
3. Page receives validated locale in params
4. `getMessages(locale)` returns type-safe translation object
5. Components render translated strings from `t` object
6. Language switcher builds alternate locale links using `pathnameWithoutLocale`

**State Management:**

- **Server State:** Fetched data cached via Next.js ISR (Deezer releases, show metadata)
- **Client State:** React hooks in client components (scroll position, menu open, video mute, popup dismissed)
- **Persistent State:** sessionStorage for "release popup dismissed" flag
- **Route State:** Locale param, pathname used to determine active nav link

## Key Abstractions

**Locale Abstraction:**
- Purpose: Type-safe, validated locales with fallback
- Examples: `lib/i18n.ts` exports `Locale` type and `locales` array
- Pattern: Discriminated union (`"de" | "en"` literal types); middleware validates before data layer access

**Release/Deezer Abstraction:**
- Purpose: Normalize Deezer API response to internal types
- Examples: `lib/deezer.ts` exports `DeezerRelease` type and `getAllReleases()` function
- Pattern: Async service function with error boundary (returns empty array on failure); caching via Next.js `next.revalidate` option

**Component Composition:**
- Purpose: Reusable UI elements with consistent styling
- Examples: `components/navigation.tsx` (main nav with mobile/desktop variants), `components/social-icons.tsx` (icon components)
- Pattern: Client components with internal state; server-side props passed from layouts

**Data Modules (Static):**
- Purpose: Single source of truth for content
- Examples: `data/releases.ts` (Release type, videos array), `data/site.ts` (siteConfig), `data/social.ts` (socialLinks)
- Pattern: Exported constants/types; no logic

## Entry Points

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: Every page request
- Responsibilities: Sets global metadata, loads heading font (Cormorant Garamond), exports `fontVariable` for locale layout

**Locale Layout:**
- Location: `app/[locale]/layout.tsx`
- Triggers: All requests with locale segment
- Responsibilities: Validates locale, renders HTML wrapper, fetches latest release, renders Navigation/Footer/NewReleasePopup

**Home Page:**
- Location: `app/[locale]/page.tsx`
- Triggers: `/de`, `/en` requests
- Responsibilities: Renders HeroVideo component with locale

**Middleware:**
- Location: `middleware.ts` (root)
- Triggers: All incoming requests except static files/API
- Responsibilities: Enforces locale prefix, redirects to default locale if missing

**API Endpoint:**
- Location: `app/api/revalidate/route.ts`
- Triggers: External Vercel cron job (daily)
- Responsibilities: Validates auth token, revalidates all locale pages, triggers Deezer re-fetch

## Error Handling

**Strategy:** Defensive with graceful degradation

**Patterns:**

- **Data Fetch Errors:** `try/catch` in `lib/deezer.ts` returns empty array or null; page renders empty state or fallback
- **Invalid Locale:** `notFound()` called in `app/[locale]/layout.tsx` returns 404 if locale fails validation
- **Missing Env Vars:** API revalidation returns 401 if `CRON_SECRET` missing or mismatched
- **Async Component Errors:** Unhandled errors propagate to Next.js error boundary (default error page rendered)
- **Video Loading:** Timeout fallback (4.5s) in HeroVideo; reduced-motion fallback for accessibility

## Cross-Cutting Concerns

**Logging:** None (console used only in debug; no structured logging)

**Validation:**
- Locale validation via `isValidLocale()` type guard
- Next.js automatic param validation (Promise resolution)
- No input sanitization (static site, no user input)

**Authentication:**
- API route uses Bearer token in header (`CRON_SECRET` env var)
- No user authentication (public website)

**Internationalization:**
- Handled at routing level (locale segment)
- Message selection via `getMessages(locale)`
- Type-safe via `Messages` type exported from `lib/i18n.ts`

**Caching:**
- Next.js ISR: Deezer API responses cached for 3600s (1 hour)
- Vercel cron revalidates daily
- Client: sessionStorage for popup dismissed state

**Performance:**
- Image optimization via Next.js `next/image` (lazy loading, responsive sizes)
- Video lazy loading (src only added on mount)
- Dynamic imports not used (small bundle)
- CSS containment via Tailwind; minimal custom CSS

---

*Architecture analysis: 2026-03-19*
