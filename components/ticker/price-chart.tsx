import type { HistoryPoint } from "@/lib/ticker/engine";

interface Props {
  history: HistoryPoint[];
  rising: boolean; // Trend der 24h-Kennzahl — Chart-Farbe konsistent zum Pfeil
  floorEuro: number;
  labels: { floor: string; sale: string; start: string; today: string };
}

// Trendfarben identisch zu den Theme-Tokens --color-market-up/-down
// (SVG-fill/stroke brauchen konkrete Werte). Nie farb-allein: Pfeil/Vorzeichen
// und Marker tragen die Information zusätzlich.
const UP = "#9cb579";
const DOWN = "#c08552";
const GRID = "rgba(212, 203, 190, 0.08)";
const INK_MUTED = "rgba(212, 203, 190, 0.42)";
const SURFACE = "#161210";

const fmt = (n: number) => `€${n.toFixed(2).replace(".", ",")}`;

// Börsen-Chart als pures Server-SVG: Kurs-Linie + dezente Fläche,
// rezessives Grid mit €-Skala, gestrichelte Boden-Linie (ehrlich im Bild —
// man sieht, wie viel Luft nach unten ist) und Verkaufs-Punkte als Events.
export function PriceChart({ history, rising, floorEuro, labels }: Props) {
  if (history.length < 2) return null;

  const W = 960;
  const H = 340;
  const PAD = { top: 24, right: 20, bottom: 30, left: 62 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const prices = history.map((p) => p.price);
  const dataMax = Math.max(...prices);
  const yMin = Math.max(0, floorEuro - 0.5);
  const yMax = dataMax * 1.08;
  const t0 = new Date(history[0].t).getTime();
  const t1 = new Date(history[history.length - 1].t).getTime();
  const tSpan = Math.max(t1 - t0, 1);

  const x = (t: string) =>
    PAD.left + ((new Date(t).getTime() - t0) / tSpan) * iw;
  const y = (p: number) => PAD.top + (1 - (p - yMin) / (yMax - yMin)) * ih;

  const pts = history.map(
    (p) => `${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`
  );
  const color = rising ? UP : DOWN;
  const gradId = rising ? "tickerAreaUp" : "tickerAreaDown";

  // 4 ruhige Grid-Linien mit €-Beschriftung
  const gridSteps = [0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const sales = history.filter((p) => p.event === "sale");
  const floorY = y(floorEuro);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`${labels.start}: ${fmt(history[0].price)} — ${labels.today}: ${fmt(history[history.length - 1].price)}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid + €-Skala (rezessiv) */}
      {gridSteps.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke={GRID}
            strokeWidth="1"
          />
          <text
            x={PAD.left - 10}
            y={y(v) + 3.5}
            textAnchor="end"
            fontSize="11"
            fill={INK_MUTED}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {fmt(v)}
          </text>
        </g>
      ))}

      {/* Boden-Linie — der lächerliche Ernst des Marktes */}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={floorY}
        y2={floorY}
        stroke={DOWN}
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeDasharray="5 5"
      />
      <text
        x={W - PAD.right}
        y={floorY - 7}
        textAnchor="end"
        fontSize="11"
        fill={INK_MUTED}
      >
        {labels.floor}
      </text>

      {/* Fläche + Kurs-Linie */}
      <polygon
        points={`${PAD.left},${PAD.top + ih} ${pts.join(" ")} ${W - PAD.right},${PAD.top + ih}`}
        fill={`url(#${gradId})`}
      />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Verkaufs-Events: Marker mit Surface-Ring + nativem Tooltip */}
      {sales.map((p) => (
        <circle
          key={p.t}
          cx={x(p.t)}
          cy={y(p.price)}
          r="4.5"
          fill={UP}
          stroke={SURFACE}
          strokeWidth="2"
        >
          <title>{`${labels.sale} — ${fmt(p.price)}`}</title>
        </circle>
      ))}

      {/* Zeit-Endpunkte */}
      <text x={PAD.left} y={H - 8} fontSize="11" fill={INK_MUTED}>
        {labels.start}
      </text>
      <text
        x={W - PAD.right}
        y={H - 8}
        textAnchor="end"
        fontSize="11"
        fill={INK_MUTED}
      >
        {labels.today}
      </text>
    </svg>
  );
}
