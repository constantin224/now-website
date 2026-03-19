# External Integrations

**Analysis Date:** 2026-03-19

## APIs & External Services

**Music Streaming:**
- Deezer API - Fetches artist releases (albums, singles, EPs)
  - SDK/Client: Native fetch() API
  - Endpoint: `https://api.deezer.com/artist/{ARTIST_ID}/albums?limit=50`
  - Artist ID: 156250942 (Now. on Deezer)
  - Cache: 1-hour revalidation via Vercel Cron

- Spotify - Artist pages (static links, no API)
  - Artist URL: https://open.spotify.com/intl-de/artist/46Z2az8XmrXnhr0ej2sr3Q
  - Used in: Release links, social links, embed iframe

- Apple Music - Artist pages (static links, no API)
  - Artist URL: https://music.apple.com/at/artist/now/1603132645
  - Used in: Release links

**Event Management:**
- Bandsintown - Event widget and artist discovery
  - Widget: Embedded via JavaScript from `https://widget.bandsintown.com/main.min.js`
  - Artist ID: 3443904
  - Implementation: `components/bandsintown-widget.tsx`
  - Fallback: Direct link to https://www.bandsintown.com/a/3443904-now. if widget fails
  - Features: Shows list, ticket links, past shows display

**Video Streaming:**
- YouTube - Videos and artist channel
  - Used for: Video embeds with facade (lazy-load), thumbnails, channel link
  - Thumbnail source: `https://img.youtube.com/vi/{videoId}/hqdefault.jpg`
  - Embed: `https://www.youtube.com/embed/{videoId}?autoplay=1`
  - Artist channel: https://www.youtube.com/@now.

**Release Distribution:**
- Hypeddit - Music promotion and single page
  - URL: https://hypeddit.com/now-music
  - Used in: Call-to-action buttons on music page

## Data Storage

**Databases:**
- Not used - Fully static site with external API fetches

**File Storage:**
- Static assets: `/public` directory
  - Images: Album covers, OG images
  - Favicon and site assets

- CDN: Vercel's built-in CDN for Next.js builds

**Caching:**
- Next.js ISR (Incremental Static Regeneration)
  - Deezer API: 1-hour cache via `{ next: { revalidate: 3600 } }`
  - Revalidation trigger: Daily Vercel Cron at 06:00 UTC

## Authentication & Identity

**Auth Provider:**
- None - Public website with no authentication layer

**API Security:**
- Cron revalidation: Simple Bearer token authentication
  - Header: `Authorization: Bearer ${CRON_SECRET}`
  - Environment variable: `process.env.CRON_SECRET` (Vercel-managed)
  - No user authentication required

## Monitoring & Observability

**Error Tracking:**
- Not detected

**Logs:**
- Default: Vercel deployment logs
- Client-side errors: Browser console only

## CI/CD & Deployment

**Hosting:**
- Vercel - Managed deployment platform
  - Git integration: GitHub (inferred from presence in Tonherd workflow)
  - Auto-deploy: On push to main/master
  - Edge middleware: Runs locale routing on Vercel Edge Network

**CI Pipeline:**
- Vercel CI - Automatic builds and preview deployments
- No explicit CI service detected (no GitHub Actions, GitLab CI, etc.)

**Cron Jobs:**
- Schedule: `0 6 * * *` (daily at 06:00 UTC)
- Endpoint: `POST /api/revalidate`
- Purpose: Revalidate all cached pages to fetch latest Deezer releases
- Status: Configured in `vercel.json`

## Environment Configuration

**Required env vars:**
- `CRON_SECRET` - Bearer token for `/api/revalidate` endpoint (Vercel Cron authentication)

**Domain Configuration:**
- Primary domain: https://now-music.at (hardcoded in sitemap, robots.ts, OG tags)

**Secrets location:**
- Vercel Environment Variables dashboard (project settings)
- `.env.local` (local development, never committed)

## Webhooks & Callbacks

**Incoming:**
- Vercel Cron webhook → `/api/revalidate`
  - Triggers daily page revalidation
  - Returns JSON with revalidation status and timestamp

**Outgoing:**
- None detected

## Image Handling

**Remote Image Sources:**
- Deezer CDN - Album covers
  - Domains allowed in Next.js config:
    - `cdn-images.dzcdn.net` (cover images)
    - `e-cdns-images.dzcdn.net` (alternative CDN)
    - `api.deezer.com` (API responses)

- YouTube - Thumbnails
  - Domain: `img.youtube.com`
  - Format: `https://img.youtube.com/vi/{videoId}/hqdefault.jpg`

- Local/Vercel - Static OG image
  - Path: `/og-image.jpg`

## Third-Party Embeds

**Embedded Scripts:**
- Bandsintown widget: `https://widget.bandsintown.com/main.min.js`
  - Loads asynchronously, includes error handling and 8-second timeout
  - Custom styling applied via DOM manipulation

- Spotify embed: `https://open.spotify.com/embed/artist/{artistId}?theme=0`
  - Lazy-loaded on user interaction (click to load)
  - Embedded as iframe with autoplay/fullscreen permissions

---

*Integration audit: 2026-03-19*
