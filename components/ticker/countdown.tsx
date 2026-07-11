"use client";

import { useEffect, useState } from "react";

interface Props {
  targetIso: string;
  labels: {
    title: string;
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
  };
}

// Sekunden-Countdown bis zum Gig — vier Kacheln, Ticketmaster-Idiom, todernst.
// Das Ticken ist Inhalt (kein Deko-Effekt) und läuft daher überall — auch bei
// prefers-reduced-motion. Gerendert wird erst nach der Hydration, damit
// Server- und Client-Markup nicht auseinanderlaufen (kein SSR-Mismatch).
export function Countdown({ targetIso, labels }: Props) {
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    let id: NodeJS.Timeout | null = null;
    const update = () => {
      const remaining = Math.max(0, target - Date.now());
      setMsLeft(remaining);
      // Interval stoppen wenn Countdown vorbei ist, um unnötige Ticks zu sparen.
      if (remaining === 0 && id !== null) {
        clearInterval(id);
      }
    };
    update();
    id = setInterval(update, 1000);
    return () => {
      if (id !== null) {
        clearInterval(id);
      }
    };
  }, [targetIso]);

  if (msLeft === null) return null; // erst nach Hydration rendern

  const s = Math.floor(msLeft / 1000);
  const units = [
    [Math.floor(s / 86400), labels.days],
    [Math.floor((s % 86400) / 3600), labels.hours],
    [Math.floor((s % 3600) / 60), labels.minutes],
    [s % 60, labels.seconds],
  ] as const;

  return (
    <div>
      <p className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-sand-38 mb-3">
        {labels.title}
      </p>
      <div className="flex gap-3">
        {units.map(([value, label]) => (
          <div
            key={label}
            className="border border-line rounded-lg px-4 py-3 text-center min-w-[4.5rem]"
          >
            <div className="font-light text-3xl md:text-4xl text-sand tabular-nums">
              {String(value).padStart(2, "0")}
            </div>
            <div className="text-[10px] md:text-xs uppercase tracking-[0.1em] text-sand-38 mt-1">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
