"use client";

import { useState } from "react";

interface Props {
  href: string;
  label: string;
  queue: { position: string; waiting: string; proceeding: string };
}

// Fake-Warteschlange: 3 Sekunden todernster Konzern-Spinner, dann Checkout.
// Sieht aus wie eine echte Ticket-Warteschlange — nur ist man „Position 1 von 1".
export function QueueGate({ href, label, queue }: Props) {
  const [phase, setPhase] = useState<"idle" | "queueing">("idle");

  function start() {
    setPhase("queueing");
    // Bewusste Verzögerung: die „Warteschlange" muss sich echt anfühlen.
    setTimeout(() => {
      window.location.href = href;
    }, 3000);
  }

  if (phase === "queueing") {
    return (
      <div
        className="border border-line rounded-lg p-6 max-w-md bg-bg-card/40"
        role="status"
        aria-live="polite"
      >
        {/* Fortschrittsbalken — Salbeigrün wie der Aufwärtstrend der Börse.
            Puls nur auf Desktop und nur wenn keine reduzierten Bewegungen
            gewünscht sind; sonst steht der Balken statisch (Design-Hausregel). */}
        <div className="h-1 bg-sand/10 rounded-full overflow-hidden mb-4">
          <div className="h-full w-1/3 rounded-full bg-[#87a06d] md:motion-safe:animate-pulse" />
        </div>
        <p className="text-sand font-medium">{queue.position}</p>
        <p className="text-sm text-sand/60 mt-1">{queue.waiting}</p>
        <p className="text-sm text-sand/60 mt-1">{queue.proceeding}</p>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      className="inline-block border border-terracotta/30 bg-terracotta/10 text-terracotta px-8 py-3 text-[11px] tracking-[3px] uppercase hover:bg-terracotta/20 transition-colors rounded-full cursor-pointer"
    >
      {label}
    </button>
  );
}
