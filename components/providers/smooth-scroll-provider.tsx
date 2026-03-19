"use client";
import { useEffect, useRef } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger } from "@/lib/gsap";

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Mobile/Touch: kein Lenis, nativer Scroll
    const isDesktop = window.matchMedia("(min-width: 768px)").matches
      && !("ontouchstart" in window);
    if (!isDesktop) return;

    const lenis = new Lenis({ autoRaf: false });
    lenisRef.current = lenis;

    // Sync: Lenis informiert ScrollTrigger ueber Scroll-Position
    lenis.on("scroll", ScrollTrigger.update);

    // GSAP Ticker treibt Lenis RAF (ein einziger Loop)
    const update = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(update);
      lenisRef.current = null;
    };
  }, []);

  return <>{children}</>;
}
