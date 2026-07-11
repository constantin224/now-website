"use client";

import { useState } from "react";

interface Props {
  text: string; // fertiger Share-Text inkl. Preis
  label: string;
  doneLabel: string;
}

// „Kurs teilen": native Share-Sheet wo vorhanden, sonst Clipboard.
export function ShareRate({ text, label, doneLabel }: Props) {
  const [done, setDone] = useState(false);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch {
      // Abbruch durch User — kein Fehlerzustand nötig
    }
  }

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-sand/50 hover:text-terracotta transition-colors duration-200 cursor-pointer"
    >
      {/* Lucide "share" als Inline-SVG — kein Emoji, konsistente Strichstärke */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" x2="12" y1="2" y2="15" />
      </svg>
      {done ? doneLabel : label}
    </button>
  );
}
