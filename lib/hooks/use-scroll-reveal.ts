"use client";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

interface ScrollRevealOptions {
  /** Vertikaler Offset in Pixel (Standard: 30) */
  y?: number;
  /** Animationsdauer in Sekunden (Standard: 0.8) */
  duration?: number;
  /** Verzoegerung in Sekunden (Standard: 0) */
  delay?: number;
  /** ScrollTrigger start Position (Standard: "top 85%") */
  start?: string;
}

/**
 * Wiederverwendbarer Scroll-Reveal Hook.
 *
 * - Verwendet gsap.from() fuer Progressive Enhancement (Content sichtbar ohne JS)
 * - Respektiert prefers-reduced-motion via gsap.matchMedia
 * - Automatisches Cleanup bei Route-Wechsel via useGSAP
 * - Gibt eine ref zurueck die auf das zu animierende Element gesetzt wird
 *
 * Verwendung:
 * ```tsx
 * const ref = useScrollReveal({ y: 40, duration: 1 });
 * return <div ref={ref}>Animated Content</div>;
 * ```
 */
export function useScrollReveal(options: ScrollRevealOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(el, {
        opacity: 0,
        y: options.y ?? 30,
        duration: options.duration ?? 0.8,
        delay: options.delay ?? 0,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: options.start ?? "top 85%",
          toggleActions: "play none none none",
        },
      });
    });
  }, { scope: ref });

  return ref;
}
