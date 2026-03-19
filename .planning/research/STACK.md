# Technology Stack: Premium Visual Upgrade

**Project:** Now. Website - Premium Animation Layer
**Researched:** 2026-03-19
**Scope:** Animation, scroll effects, transitions, micro-interactions on top of existing Next.js 16 / React 19 / Tailwind CSS 4

## Recommended Stack

### Animation Engine

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| GSAP | 3.14.2 | Scroll-triggered animations, timeline sequences, text splitting | Industry standard for premium/cinematic web animation. Timeline-based API gives precise control over complex sequences. Now 100% free (incl. premium plugins) after Webflow acquisition. ScrollTrigger + SplitText are unmatched for the "award-winning artist site" feel. | HIGH |
| @gsap/react | 2.1.2 | React integration via useGSAP() hook | Drop-in replacement for useEffect with automatic cleanup via gsap.context(). Handles SSR safety (falls back to useEffect when window undefined). Prevents memory leaks on route changes -- critical for Next.js App Router. | HIGH |

**Why GSAP over Motion (Framer Motion):**
Motion (v12.37.0) is excellent for UI state transitions (modals, toasts, layout animations), but GSAP is the clear winner for cinematic, scroll-driven, timeline-based animation -- exactly what a premium artist website needs. GSAP's ScrollTrigger, SplitText, and timeline chaining are purpose-built for this use case. Motion is declarative (good for UI), GSAP is imperative (good for cinema). Since GSAP became fully free in April 2025, the licensing argument for Motion is gone.

### Smooth Scroll

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Lenis | 1.3.19 | Smooth scroll normalization | De-facto standard for premium scroll feel. Lightweight, accessible (doesn't break native scroll), works perfectly with GSAP ScrollTrigger. Used by Darkroom Engineering (top agency). autoRaf option simplifies setup. | HIGH |

### CSS Techniques (no extra libraries)

| Technique | Purpose | Why | Confidence |
|-----------|---------|-----|------------|
| CSS scroll-driven animations | Simple parallax, fade-in on scroll | Runs on compositor thread (zero jank, 60fps). Supported in Chrome, Edge, Safari 18+. Use for lightweight effects, GSAP for complex ones. Progressive enhancement with @supports. | MEDIUM |
| CSS View Transitions API | Page transition effects | Experimental in Next.js 16 (viewTransition flag in next.config). Not production-ready -- React's ViewTransition component is Canary-only. Monitor but don't depend on it yet. | LOW |
| Tailwind CSS 4 custom animations | Hover states, micro-interactions | Already in the stack. @keyframes in globals.css + Tailwind utilities for simple hover/focus states. No extra dependency needed. | HIGH |

### GSAP Plugins (all free since April 2025)

| Plugin | Purpose | When to Use |
|--------|---------|-------------|
| ScrollTrigger | Scroll-linked animations, pin sections, parallax | Every scroll-based animation. The backbone of the visual upgrade. |
| SplitText | Animate text by character/word/line | Headlines, hero text, section reveals. autoSplit handles responsive resize. |
| ScrollSmoother | GSAP-native smooth scroll alternative | Only if Lenis causes issues (unlikely). Don't install both. |
| Flip | Layout transition animations | If needed for content reflow animations (e.g., filter/sort). |

### What NOT to Install

| Library | Why Not |
|---------|---------|
| Motion / Framer Motion | Overlaps with GSAP. Adding both creates confusion about which to use where. GSAP covers everything needed for this project. Motion's declarative API is better for app UI, not cinematic websites. |
| react-spring | Outdated for this use case. Physics-based animations are niche; GSAP handles easing better for scroll-driven work. |
| Locomotive Scroll | Predecessor to Lenis, deprecated in favor of it. Same team (Darkroom Engineering) recommends Lenis now. |
| ScrollMagic | Abandoned. Last meaningful update years ago. GSAP ScrollTrigger replaced it entirely. |
| AOS (Animate on Scroll) | Too basic. Class-toggle library with preset animations. Looks generic, not premium. |
| react-scroll | Basic scroll navigation utility, not an animation library. |
| Skrollr | Dead project. Not maintained. |
| next-view-transitions | Wrapper for experimental API. Too unstable for production. Revisit when React stabilizes ViewTransition. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Animation engine | GSAP 3.14 | Motion 12.37 | Motion excels at UI state, not cinematic timelines. GSAP's ScrollTrigger + SplitText have no equivalent in Motion. |
| Smooth scroll | Lenis 1.3 | GSAP ScrollSmoother | Lenis is more lightweight, better maintained for React, and doesn't lock you into GSAP's scroll system. |
| Text animation | GSAP SplitText | SplitType | SplitText is now free, has autoSplit for responsive, and integrates natively with GSAP timelines. No reason for a separate library. |
| Simple scroll effects | CSS scroll-driven animations | Intersection Observer | CSS version runs off main thread (better performance). Use IO only as fallback for Firefox. |

## Installation

```bash
# Animation engine + React integration
npm install gsap @gsap/react

# Smooth scroll
npm install lenis
```

That's it. Two packages plus one React adapter. The entire premium animation layer in ~50KB gzipped.

## Setup Pattern

```typescript
// lib/gsap.ts -- register plugins once
"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export { gsap, ScrollTrigger, SplitText, useGSAP };
```

```typescript
// app/[locale]/layout.tsx -- Lenis provider
"use client";
import Lenis from "lenis";
import { useEffect } from "react";

// Initialize Lenis with autoRaf for simplest setup
// Connect to GSAP ScrollTrigger for sync
```

## Mobile Performance Strategy

All animation libraries must respect the existing constraint: effects on Desktop only, Mobile statisch.

```typescript
// Utility: detect reduced motion + mobile
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.innerWidth < 768;

// Skip GSAP animations on mobile / reduced motion
// Use CSS-only transitions as lightweight fallback
```

GSAP's ScrollTrigger has built-in matchMedia support for responsive animation breakpoints -- animations can be completely disabled below a threshold.

## Sources

- [GSAP npm](https://www.npmjs.com/package/gsap) -- v3.14.2, confirmed 2026-03-19
- [@gsap/react npm](https://www.npmjs.com/package/@gsap/react) -- v2.1.2
- [Motion npm](https://www.npmjs.com/package/motion) -- v12.37.0, confirmed 2026-03-19
- [Lenis npm](https://www.npmjs.com/package/lenis) -- v1.3.19, confirmed 2026-03-19
- [GSAP is now free](https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/) -- April 2025, Webflow acquisition
- [GSAP ScrollTrigger docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [GSAP React integration](https://gsap.com/resources/React/)
- [CSS scroll-driven animations MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations)
- [Next.js viewTransition config](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition) -- experimental
- [Motion vs GSAP comparison](https://motion.dev/docs/gsap-vs-motion)
