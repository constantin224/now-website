"use client";
import { useSyncExternalStore } from "react";

// useSyncExternalStore statt useState+useEffect: matchMedia IST ein externer
// Store. So gibt es kein setState-im-Effect (Extra-Render nach der Hydration
// entfällt), und die Subscribe-Funktionen sind modulweit stabil — sonst würde
// React bei jedem Render neu abonnieren.

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const DESKTOP = "(min-width: 768px)";

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

const subscribeReducedMotion = subscribeTo(REDUCED_MOTION);
const subscribeDesktop = subscribeTo(DESKTOP);
const serverSnapshot = () => false; // SSR: konservativ false (kein Desktop, keine Reduktion)

/**
 * Prueft ob der User prefers-reduced-motion aktiviert hat.
 * Gibt true zurueck wenn Animationen reduziert werden sollen.
 * SSR-safe: gibt false zurueck auf dem Server.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    serverSnapshot
  );
}

/**
 * Prueft ob das Geraet ein Desktop ist (min-width 768px, kein Touch).
 * SSR-safe: gibt false zurueck auf dem Server.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches && !("ontouchstart" in window),
    serverSnapshot
  );
}
