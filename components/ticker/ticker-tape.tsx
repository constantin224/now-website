interface Props {
  items: string[]; // fertig formatierte Segmente, z.B. "NOW.T €11,90 ▼ 4,9 %"
}

// Börsen-Laufband: läuft nur auf Desktop und ohne reduced-motion
// (.animate-ticker-tape in globals.css), sonst statische Zeile.
// Inhalt wird für die Endlos-Schleife dupliziert — Kopie ist aria-hidden.
export function TickerTape({ items }: Props) {
  const line = items.join("   ·   ");
  return (
    <div className="border-y border-line overflow-hidden py-3 select-none">
      <div className="flex w-max animate-ticker-tape whitespace-nowrap">
        <span className="text-[11px] md:text-xs tracking-[0.2em] uppercase text-sand/50 tabular-nums pr-16">
          {line}
        </span>
        <span
          aria-hidden="true"
          className="hidden md:inline text-[11px] md:text-xs tracking-[0.2em] uppercase text-sand/50 tabular-nums pr-16"
        >
          {line}
        </span>
      </div>
    </div>
  );
}
