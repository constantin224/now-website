"use client";
import { useState, useEffect } from "react";

/**
 * Prueft ob der User prefers-reduced-motion aktiviert hat.
 * Gibt true zurueck wenn Animationen reduziert werden sollen.
 * SSR-safe: gibt false zurueck auf dem Server.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mql.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReduced;
}

/**
 * Prueft ob das Geraet ein Desktop ist (min-width 768px, kein Touch).
 * SSR-safe: gibt false zurueck auf dem Server.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsDesktop(
        window.matchMedia("(min-width: 768px)").matches
        && !("ontouchstart" in window)
      );
    };
    check();

    const mql = window.matchMedia("(min-width: 768px)");
    const handler = () => check();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}
