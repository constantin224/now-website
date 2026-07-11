import type { HistoryPoint } from "@/lib/ticker/engine";

interface Props {
  history: HistoryPoint[];
}

// Trend-Farben im Erd-Palette-Look der Now.-Seite:
// Gewinn = gedämpftes Salbeigrün, Verlust = Terracotta (Marken-Akzent).
// Behält die Börsen-Semantik (grün rauf / rot runter) bei, ohne Signalfarben.
const UP = "#87a06d";
const DOWN = "#a07352";

// Börsen-Chart als pures SVG: Linie + Fläche, Farbe nach Gesamttrend.
// Server-gerendert — kein JS auf dem Client, kein Chart-Framework.
export function PriceChart({ history }: Props) {
  if (history.length < 2) return null;

  const W = 800;
  const HG = 280;
  const PAD = 8;
  const prices = history.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(max - min, 0.5); // nie durch 0 teilen
  const t0 = new Date(history[0].t).getTime();
  const t1 = new Date(history[history.length - 1].t).getTime();
  const tSpan = Math.max(t1 - t0, 1);

  const pts = history.map((p) => {
    const x = PAD + ((new Date(p.t).getTime() - t0) / tSpan) * (W - 2 * PAD);
    const y = PAD + (1 - (p.price - min) / span) * (HG - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const rising = prices[prices.length - 1] >= prices[0];
  const color = rising ? UP : DOWN;

  return (
    <svg
      viewBox={`0 0 ${W} ${HG}`}
      className="w-full h-auto"
      role="img"
      aria-label={`€${min.toFixed(2)} – €${max.toFixed(2)}`}
    >
      <polygon
        points={`${PAD},${HG - PAD} ${pts.join(" ")} ${W - PAD},${HG - PAD}`}
        fill={color}
        opacity={0.12}
      />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
