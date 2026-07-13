"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  href: string;
  label: string;
  queue: { position: string; waiting: string; proceeding: string };
}

// Fake-Warteschlange: 3 Sekunden todernster Konzern-Spinner, dann Checkout.
// Sieht aus wie eine echte Ticket-Warteschlange — nur ist man „Position 1 von 1".
export function QueueGate({ href, label, queue }: Props) {
  const [phase, setPhase] = useState<"idle" | "queueing">("idle");
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup: Timeout bei Unmount oder Phase-Wechsel clearen, um Stray-Redirect
  // nach Navigation zu verhindern. Navigiert der User während "queueing" weg,
  // würde der Timeout sonst trotzdem feuern und ihn zum Shop zurückreißen.
  useEffect(() => {
    return () => {
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  function start(e: React.MouseEvent<HTMLAnchorElement>) {
    // Ohne JS (oder vor der Hydration) bleibt der Link ein normaler Link zum
    // Shop — der Kaufweg ist NIE tot. Nur wenn JS läuft, schieben wir die
    // Fake-Warteschlange dazwischen.
    e.preventDefault();
    setPhase("queueing");
    // Bewusste Verzögerung: die „Warteschlange" muss sich echt anfühlen.
    timeoutIdRef.current = setTimeout(() => {
      window.location.href = href;
    }, 3000);
  }

  if (phase === "queueing") {
    return (
      <div
        className="border border-line rounded-lg p-6 max-w-md mx-auto text-left bg-bg-card/40"
        role="status"
        aria-live="polite"
      >
        {/* Fortschrittsbalken — Salbeigrün wie der Aufwärtstrend der Börse.
            Puls nur auf Desktop und nur wenn keine reduzierten Bewegungen
            gewünscht sind; sonst steht der Balken statisch (Design-Hausregel). */}
        <div className="h-1 bg-sand/10 rounded-full overflow-hidden mb-4">
          <div className="h-full w-1/3 rounded-full bg-market-up md:motion-safe:animate-pulse" />
        </div>
        <p className="text-sand font-medium">{queue.position}</p>
        <p className="text-sm text-sand/60 mt-1">{queue.waiting}</p>
        <p className="text-sm text-sand/60 mt-1">{queue.proceeding}</p>
      </div>
    );
  }

  return (
    <a
      href={href}
      onClick={start}
      className="inline-flex w-max items-center justify-center whitespace-nowrap border border-terracotta/30 bg-terracotta/10 text-terracotta px-10 py-4 text-xs tracking-[3px] uppercase hover:bg-terracotta/20 transition-colors duration-200 rounded-full cursor-pointer"
    >
      {label}
    </a>
  );
}
