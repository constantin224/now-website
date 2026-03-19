# Codebase Concerns

**Analysis Date:** 2026-03-19

## Tech Debt

**Incomplete Press Kit Resources:**
- Issue: Press page has commented-out download sections for `/press/photos.zip` and `/press/onesheet.pdf` that need to be created
- Files: `app/[locale]/press/page.tsx` (lines 71-79, 122-130)
- Impact: Users cannot download full press kit materials. Limits EPK functionality, important for booking/promotion
- Fix approach: Create ZIP archive with band photos and PDF one-sheet in `/public/press/` directory, then uncomment blocks

**Hardcoded Artist ID in Deezer:**
- Issue: Artist ID (156250942) is hardcoded constant in library function
- Files: `lib/deezer.ts` (line 2)
- Impact: No flexibility if artist ID changes or for multi-artist scenarios. Makes testing difficult
- Fix approach: Move to environment variable or configuration file: `NEXT_PUBLIC_DEEZER_ARTIST_ID`

**Spotify Artist ID Duplication:**
- Issue: Spotify artist ID (46Z2az8XmrXnhr0ej2sr3Q) appears in multiple places: `lib/deezer.ts` (line 106), `app/[locale]/music/page.tsx` (line 109)
- Files: `lib/deezer.ts`, `app/[locale]/music/page.tsx`
- Impact: Maintenance burden when ID changes. Creates inconsistency risk
- Fix approach: Move all streaming service IDs to centralized `data/artists.ts` configuration

**Band Photo References:**
- Issue: Photos referenced in multiple locations with hardcoded paths, no central manifest
- Files: `app/[locale]/about/page.tsx`, `app/[locale]/press/page.tsx`
- Impact: Difficult to track which photos exist. Adding new photos requires updating multiple files
- Fix approach: Create `data/media.ts` with photo/video manifest including dimensions and alt text

**Locale Validation Without Strong Typing:**
- Issue: Routes accept `locale` as string, then cast `as Locale` multiple times throughout pages
- Files: `app/[locale]/page.tsx`, `app/[locale]/music/page.tsx`, `app/[locale]/press/page.tsx`, `app/[locale]/about/page.tsx`, `app/[locale]/shows/page.tsx`
- Impact: Runtime errors possible if invalid locale somehow reaches components. Type safety lost at component boundary
- Fix approach: Use `Promise<{ locale: Locale }>` in page params instead of `Promise<{ locale: string }>`, validate in middleware

## Known Issues

**Bandsintown Widget Integration Fragility:**
- Symptoms: Widget may fail to load externally hosted script. Fallback is a simple link, not data-driven list
- Files: `components/bandsintown-widget.tsx`
- Trigger: Network issues, CORS problems, or Bandsintown service changes. Polled DOM updates every 1s for 15s
- Workaround: Fallback button links to Bandsintown artist page. Manual DOM traversal to restyle buttons is brittle
- Current state: Initialized ref prevents remounting, timeout-based polling may miss updates, no error logging

**Hero Video Loading Race Condition:**
- Symptoms: Loader dismisses after 4.5s timeout OR when video is ready (whichever is sooner), causing jarring transitions if video loads very quickly or slowly
- Files: `components/hero-video.tsx` (lines 36-71)
- Trigger: Slow network (video loads after 4.5s timeout) or very fast CDN (video ready before minDelay expires)
- Current mitigation: 1.5s minimum delay before checking video readiness, 4.5s hard timeout, reduced-motion fallback works correctly

**Session Storage Key Collision Risk:**
- Symptoms: Release popup dismissal uses only release title as session storage key. Two releases with same title would share dismissal state
- Files: `components/new-release-popup.tsx` (lines 8, 20, 28)
- Trigger: If Deezer API returns releases with identical titles
- Workaround: None. Currently relies on unique titles
- Fix approach: Use `${release.id}_${release.releaseDate}` as storage key instead of title

**Deezer API Error Handling Silently Fails:**
- Symptoms: Network/parse errors return empty arrays `[]` or `null` with no logging or error indication
- Files: `lib/deezer.ts` (lines 62-64, 110-112)
- Trigger: API downtime, malformed responses, network timeouts
- Current state: Graceful degradation (empty lists shown) but no visibility into what happened. No retry logic
- Fix approach: Add error logging, consider exponential backoff for failed requests

**YouTube Embed External Dependency:**
- Symptoms: Thumbnail loaded directly from YouTube (`img.youtube.com`), no fallback if YouTube CDN is slow
- Files: `components/youtube-facade.tsx` (line 36)
- Trigger: YouTube CDN downtime or slow delivery
- Workaround: Placeholder shows while image loads
- Fix approach: Consider downloading/caching thumbnails at build time

**CRON_SECRET Validation Too Permissive:**
- Symptoms: API revalidation route uses simple Bearer token check. No rate limiting or request signing
- Files: `app/api/revalidate/route.ts` (line 9)
- Trigger: If CRON_SECRET is leaked or guessed, anyone can force cache revalidation
- Current state: Depends on environment variable secrecy. No additional protections
- Fix approach: Add rate limiting, Vercel Cron signature verification if available, IP whitelisting

## Security Considerations

**External Widget Loading (Bandsintown):**
- Risk: Third-party widget script loaded from `widget.bandsintown.com` without integrity check. DOM manipulation runs JavaScript from external source
- Files: `components/bandsintown-widget.tsx` (lines 36-41)
- Current mitigation: Script loaded asynchronously, no sensitive data passed
- Recommendations: Add Subresource Integrity (SRI) hash if Bandsintown provides stable URL, consider sandboxing in iframe

**Unoptimized Image Loading from External CDNs:**
- Risk: Deezer and YouTube image requests not proxied, exposes user requests to these services
- Files: `lib/deezer.ts`, `components/youtube-facade.tsx`, `app/[locale]/music/page.tsx`
- Current mitigation: HTTPS in use, CORS headers likely in place
- Recommendations: Consider using Next.js Image Optimization API for Deezer covers if possible, cache YouTube thumbnails

**Hardcoded Streaming Service Links:**
- Risk: Spotify, Apple Music, Deezer artist links are direct URLs. If compromised/redirected, could lead to phishing
- Files: `lib/deezer.ts` (lines 105-107), `data/releases.ts` (lines 10-13)
- Current state: Links are read-only data, no user input involved
- Recommendations: Store in environment variables if links change frequently, add periodic validation

**No CSP or Security Headers:**
- Risk: No Content Security Policy defined. Bandsintown widget and YouTube embeds have broad permissions
- Files: Entire application (no CSP set in next.config.ts or middleware)
- Impact: Vulnerable to XSS if any component is compromised
- Recommendations: Add CSP header in middleware/next.config, restrict external domains

## Performance Bottlenecks

**Large Video Files Not Optimized:**
- Problem: `/video.mp4` (10.3MB) and `/video-mobile.mp4` (1MB) served uncompressed. Hero component blocks page render until video loads
- Files: `components/hero-video.tsx`, `/public/video*`
- Cause: No video codec optimization, no progressive/streaming delivery
- Improvement path: Use VP9 codec (smaller), serve via HLS/DASH, defer video loading until after LCP, add preconnect hints

**Infinite Polling in Bandsintown Widget:**
- Problem: DOM is searched and modified every 1s for 15s (potentially 15 DOM updates per mount)
- Files: `components/bandsintown-widget.tsx` (lines 50, 82)
- Cause: Widget content isn't ready immediately, relying on polling instead of events
- Improvement path: Use MutationObserver instead of setInterval, reduce frequency to 200ms checks, add requestAnimationFrame

**Deezer API Calls Not Deduplicated:**
- Problem: Both `getLatestRelease()` and `getAllReleases()` hit same API endpoint. If both are called on same page load, two requests sent
- Files: `lib/deezer.ts`, `app/[locale]/layout.tsx`, `app/[locale]/music/page.tsx`
- Cause: Each function is independent, no request deduplication
- Improvement path: Consolidate to single API call in music page, pass results down to NewReleasePopup via context or as prop

**Unoptimized Images from External CDNs:**
- Problem: Deezer album covers (release.cover) loaded unoptimized from CDN. New Image components with `unoptimized` flag bypass Next.js optimization
- Files: `app/[locale]/music/page.tsx` (lines 73, 135), `components/new-release-popup.tsx` (lines 71, 138)
- Cause: Images are dynamic from API, Next.js Image Optimization requires dimensions at build time
- Improvement path: Use Image component with `placeholder="blur"`, pre-fetch hero cover images, use image quality 75 for thumbnails

**Navigation useEffect Not Memoized:**
- Problem: `handleScroll` function recreated on every render, addEventListener/removeEventListener called on each render
- Files: `components/navigation.tsx` (lines 30-37)
- Cause: Handler function defined inside useEffect but not memoized
- Improvement path: Use `useCallback` for `handleScroll`, or move outside hook

## Fragile Areas

**Hardcoded Show Dates in Inconsistent Order:**
- Files: `data/shows.ts` (lines 3-8)
- Why fragile: Shows are not sorted by date in data file (past dates mixed with future). Sorting happens in `lib/shows.ts` at runtime
- Safe modification: Always use `getUpcomingShows()` and `getPastShows()` helper functions. Never directly access `shows` array
- Test coverage: `lib/shows.ts` filtering logic has no tests. Date boundary cases (today at midnight) are fragile

**Icon Mapping in Footer & About:**
- Files: `components/footer.tsx` (lines 7-13), `app/[locale]/about/page.tsx` (lines 8-14)
- Why fragile: Duplicate iconMap objects. If social.ts link icon changes, both locations must be updated
- Safe modification: Extract to `components/social-icons.ts` as exported constant
- Test coverage: Icon mapping has no test. Missing icon returns null silently

**CSS Animations Hardcoded in globals.css:**
- Files: `app/globals.css` (lines 30-73)
- Why fragile: Bandsintown widget CSS overrides are brittle. Uses attribute selectors and `!important` rules that break if Bandsintown changes widget structure
- Safe modification: Use CSS modules for Bandsintown overrides, create separate stylesheet, add comments explaining each selector
- Test coverage: No visual regression tests. Widget styling changes could break in production

**Release Type Label Translation:**
- Files: `app/[locale]/music/page.tsx` (lines 22-29), `components/new-release-popup.tsx` (lines 33-44)
- Why fragile: Type labels duplicated in multiple components. String matching on Deezer `record_type` field
- Safe modification: Create `lib/releases.ts` with shared `getTypeLabel()` function, add type guard for record_type values
- Test coverage: No tests for unsupported type values (e.g., "podcast")

**Locale Casting Throughout Application:**
- Files: Multiple pages and components cast `locale as Locale`
- Why fragile: If middleware fails or URL manipulation occurs, invalid locale could reach components causing runtime errors
- Safe modification: Implement stricter type guards at entry points, use zod or io-ts for validation
- Test coverage: No tests for invalid locale handling

**Mobile Menu Scroll Lock:**
- Files: `components/navigation.tsx` (lines 40-49)
- Why fragile: Directly modifies `document.body.style.overflow`. If component unmounts during animation, cleanup may not run
- Safe modification: Use more robust scroll-lock library or test cleanup in error scenarios
- Test coverage: No tests for rapid open/close or error cleanup

## Scaling Limits

**Hardcoded Show Count Limits:**
- Current capacity: `getUpcomingShows()` returns unlimited, `getPastShows(limit = 20)` capped at 20
- Limit: If band has 100+ past shows, only latest 20 displayed. Future shows list unbounded
- Scaling path: Add pagination to past shows, load on-demand. Move shows to database when exceeds 1000 entries

**Single Deezer Artist Hardcoded:**
- Current capacity: Only one artist ID (156250942) supported
- Limit: Cannot scale to multiple related artists or label artists without refactoring
- Scaling path: Move to dynamic artist configuration, support label/collective pages

**Manual Show Data Entry:**
- Current capacity: Max realistic to manually maintain is ~50 shows
- Limit: As band tours more, manual updates become error-prone
- Scaling path: Integrate with Bandsintown API instead of widget, sync shows to database via cron job

**PresS Kit Static Files:**
- Current capacity: Current photos (3 images, ~250KB total)
- Limit: High-res photo archives will blow up page weight
- Scaling path: Implement press kit CMS or asset management, use CDN for media, paginate/lazy-load galleries

## Dependencies at Risk

**Bandsintown Widget (Third-Party Dependency):**
- Risk: External script, no version pinning, Bandsintown could remove or change API
- Impact: Shows widget fails silently, no way to display shows except via Bandsintown link
- Migration plan: Replace with Bandsintown API integration (free tier available), build custom component or use community package

**Deezer API Reliance:**
- Risk: No official rate limiting disclosed, no SLA. API could change response format
- Impact: Music page breaks if API unavailable. New releases popup disappears
- Migration plan: Maintain cached list in `data/releases.ts`, use Deezer for optional enrichment only

**Next.js 16 Image Optimization:**
- Risk: External CDN images use `unoptimized` flag, losing Next.js benefits if CDN goes down
- Impact: Performance regression, no fallback handling
- Migration plan: Download and cache images at build time when possible, proxy dynamic images through Next.js

**YouTube Thumbnails:**
- Risk: `img.youtube.com` CDN external dependency, no fallback
- Impact: Video grid shows broken images if YouTube CDN unreachable
- Migration plan: Cache thumbnails in `/public` at build time, generate from uploaded preview images

## Missing Critical Features

**Error Pages (404, 500):**
- Problem: No custom error pages defined. Next.js default errors shown
- Blocks: Brand consistency, user guidance on errors
- Fix: Add `app/not-found.tsx` and `app/error.tsx` with design system

**Analytics:**
- Problem: No GA, Vercel Analytics, or custom event tracking
- Blocks: Cannot measure engagement, traffic sources, or conversion to streaming platforms
- Fix: Add `next/script` with Google Analytics 4, track page views and link clicks

**Sitemap & Robots.txt:**
- Problem: `app/sitemap.ts` exists but `/robots.txt` not defined. No canonical tags on pages
- Blocks: SEO optimization, search engine crawling hints
- Fix: Add `public/robots.txt`, add canonical links to all pages, verify with Google Search Console

**i18n SEO Meta Tags:**
- Problem: Metadata not localized. `og:url` and `canonical` not set per locale
- Blocks: Proper hreflang setup for multi-language site
- Fix: Add hreflang links, locale-specific Open Graph tags, alternate language metadata

**Service Worker / Offline Mode:**
- Problem: No PWA support, no offline fallback
- Blocks: Offline experience, cached assets for returning visitors
- Fix: Add service worker for offline mode, implement cache strategies

---

*Concerns audit: 2026-03-19*
