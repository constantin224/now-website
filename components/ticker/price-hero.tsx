"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  waypoints: number[]; // echte Kurs-Stationen, letzter Wert = aktueller Preis
  locale: string;
  className?: string;
}

// Der Hero-Preis tickt beim Laden einmal durch die echte Kurshistorie zum
// aktuellen Wert — man SIEHT, dass der Preis dynamisch ist, statt es zu lesen.
// Bei prefers-reduced-motion steht er sofort still auf dem Endwert.
export function PriceHero({ waypoints, locale, className }: Props) {
  const fmt = useMemo(() => {
    const nf = new Intl.NumberFormat(locale === "en" ? "en-IE" : "de-AT", {
      style: "currency",
      currency: "EUR",
    });
    // Auf 10 Cent runden — die Animation interpoliert zwischen den Stationen,
    // und ohne Rundung erschiene sekundenlang ein Preis wie 22,13 €, den der
    // Shop nie verlangt hat. Jeder gezeigte Wert muss einer sein, den man
    // tatsächlich zahlen könnte.
    //
    // Bewusst NICHT über shopPrice(): Das klemmt zusätzlich an Boden und Deckel.
    // Stünde im Shop je ein Preis außerhalb dieser Grenzen, würde der Hero ihn
    // auf 25 € zurechtrücken — und damit einen Preis versprechen, den der
    // Checkout nicht hält. Angezeigt wird, was verlangt wird.
    return (n: number) => nf.format(Math.round(n * 10) / 10);
  }, [locale]);
  const final = waypoints[waypoints.length - 1];
  const [value, setValue] = useState(final);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (waypoints.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const DURATION = 2400;
    const start = performance.now();

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - raw, 3); // ease-out — landet ruhig
      const pos = eased * (waypoints.length - 1);
      const i = Math.min(waypoints.length - 2, Math.floor(pos));
      const frac = pos - i;
      setValue(waypoints[i] + (waypoints[i + 1] - waypoints[i]) * frac);
      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(final);
      }
    };

    setValue(waypoints[0]);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // waypoints ändern sich nur mit neuem Server-Render — bewusst einmalig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span className={className}>{fmt(value)}</span>;
}
