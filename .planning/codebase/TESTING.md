# Testing Patterns

**Analysis Date:** 2026-03-19

## Test Framework

**Status:** Not implemented

**No testing framework is configured:**
- No Jest, Vitest, or other test runner in `package.json`
- No test files in the project root or app directories
- No `.test.ts`, `.spec.ts` files observed
- `package.json` only includes `npm run lint` script, no test script

**Available tooling:**
- ESLint v9 configured for linting
- TypeScript v5 for type checking
- Next.js built-in testing recommendations available

## Test File Organization

**Current state:** No test files exist

**Recommended structure if implementing tests:**
- Co-located tests next to source: `components/__tests__/navigation.test.tsx` or `components/navigation.test.tsx`
- Library tests in `lib/__tests__/` subdirectories
- API route tests in `app/api/__tests__/`

## Test Coverage

**Requirements:** None enforced

**Zero coverage:** No test infrastructure exists

## What Needs Testing

**High-priority untested code:**

**Locale and i18n (critical):**
- `lib/i18n.ts`: `getMessages()`, `isValidLocale()`
- `middleware.ts`: Locale detection and redirection logic
- `app/[locale]/layout.tsx`: Static params generation
- Risk: Silent failures in locale detection could serve wrong language

**External API Integration:**
- `lib/deezer.ts`: `getLatestRelease()`, `getAllReleases()`
- API error handling (currently returns empty/null on failure)
- Data transformation from Deezer format to internal types
- Risk: Broken releases could show no music or corrupted data

**Date/Time Operations:**
- `lib/shows.ts`: `formatShowDate()`, `getUpcomingShows()`, `getPastShows()`
- Date comparison logic with edge cases (timezone, date parsing)
- Risk: Wrong show dates, incorrect past/upcoming filtering

**Component Logic:**
- `components/new-release-popup.tsx`: Session storage logic, visibility toggle
- `components/navigation.tsx`: Scroll detection, mobile menu state
- `components/youtube-facade.tsx`: Player state toggle
- Risk: UI bugs, broken interactivity

**API Routes:**
- `app/api/revalidate/route.ts`: Authorization check, cache invalidation
- Risk: Unauthorized cache revalidation, denial of service

## Recommended Testing Approach

**Vitest recommended:**
- Modern, fast test runner
- Native ESM support (aligns with Next.js)
- Good React Testing Library integration
- Similar config to Jest but simpler

**Setup steps:**
1. Install: `npm install -D vitest @testing-library/react @testing-library/jest-dom`
2. Create `vitest.config.ts` with Next.js integration
3. Add `"test": "vitest"` and `"test:ui": "vitest --ui"` to `package.json`
4. Add `.test.tsx` files alongside components

**Suggested test suite structure:**

```typescript
// components/__tests__/navigation.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Navigation from '../navigation';

describe('Navigation', () => {
  it('renders navigation links', () => {
    // Test rendering
  });

  it('detects scroll position', () => {
    // Test scroll listener
  });

  it('toggles mobile menu', () => {
    // Test menu state
  });
});
```

```typescript
// lib/__tests__/i18n.test.ts
import { getMessages, isValidLocale, type Locale } from '../i18n';

describe('i18n', () => {
  it('returns correct messages for locale', () => {
    const de = getMessages('de');
    expect(de.nav).toBeDefined();
  });

  it('validates locales correctly', () => {
    expect(isValidLocale('de')).toBe(true);
    expect(isValidLocale('fr')).toBe(false);
  });
});
```

```typescript
// lib/__tests__/shows.test.ts
import { getUpcomingShows, getPastShows, formatShowDate } from '../shows';

describe('Shows', () => {
  it('filters upcoming shows by date', () => {
    const upcoming = getUpcomingShows();
    // Verify all dates are >= today
  });

  it('sorts shows chronologically', () => {
    // Verify ordering
  });

  it('formats dates in correct locale', () => {
    const formatted = formatShowDate('2026-04-12');
    expect(formatted).toMatch(/^\d{2}\.\s[A-Za-z]{3}$/);
  });
});
```

## Current Gaps

**No unit tests for:**
- i18n logic (critical for multi-language support)
- Date filtering and formatting
- API integration with Deezer
- Session storage state management
- Component state transitions

**No integration tests for:**
- Locale switching flow (middleware → layout → component)
- Release popup appearing and dismissing
- Mobile menu open/close interactions

**No E2E tests for:**
- Full user journey (load page → change locale → see updates)
- Release popup dismissal persistence

## Testing Philosophy (If Implemented)

**Focus on:**
- Pure function testing (i18n, date utilities) — highest ROI
- State management logic (mobile menu, popup visibility)
- API integration error handling
- Locale detection and switching

**Avoid over-testing:**
- Tailwind class application (too fragile)
- Implementation details (component internals)
- Third-party library behavior (Next.js, lucide-react)

**Mocking strategy:**
- Mock Deezer API responses for release tests
- Mock `window.scrollY` for scroll detection tests
- Mock `sessionStorage` for popup dismissal tests
- Mock Next.js navigation hooks (`usePathname`)

---

*Testing analysis: 2026-03-19*
