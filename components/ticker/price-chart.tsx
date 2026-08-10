"use client";

import { useMemo, useRef, useState } from "react";
import { shopPrice, type HistoryPoint } from "@/lib/ticker/engine";

interface Props {
  history: HistoryPoint[];
  /**
   * Trend der 24h-Kennzahl, als WERTUNG: true = Kurs fällt = die Community
   * gewinnt (grün). Die Farb-Semantik ist gegenüber einem echten Börsen-Chart
   * bewusst gedreht — Pfeil und Vorzeichen tragen die echte Richtung.
   */
  erfolg: boolean;
  floorEuro: number;
  locale: string;
  labels: {
    floor: string;
    sale: string;
    drift: string;
    start: string;
    today: string;
  };
}

// Trendfarben identisch zu den Theme-Tokens --color-market-up/-down.
// Nie farb-allein: Pfeil/Vorzeichen und Marker tragen die Information zusätzlich.
const UP = "#9cb579";
const DOWN = "#c08552";
const GRID = "rgba(212, 203, 190, 0.07)";
const INK_MUTED = "rgba(212, 203, 190, 0.42)";
const SURFACE = "#161210";



const W = 960;
const H = 380;
const PAD = { top: 34, right: 20, bottom: 30, left: 62 };

// Linear verbunden — bei Kurs-Daten Best Practice: kein Smoothing,
// das Zwischenwerte erfindet oder an Sprüngen überschwingt.
function linePathOf(pts: { x: number; y: number }[]): string {
  return `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`;
}

// Interaktiver Börsen-Chart: Kurs-Linie + Fläche, Grid, Boden-Linie,
// Verkaufs-Events — und Crosshair mit Tooltip beim Zeigen/Streichen.
export function PriceChart({ history: raw, erfolg, floorEuro, locale, labels }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Kurse: immer der gerundete SHOP-Preis, in der Sprache des Besuchers.
  // Deltas: OHNE shopPrice() — das würde kleine Differenzen auf den Boden klemmen.
  const { fmt, fmtDelta } = useMemo(() => {
    const nf = new Intl.NumberFormat(locale === "en" ? "en-IE" : "de-AT", {
      style: "currency",
      currency: "EUR",
    });
    return {
      fmt: (n: number) => nf.format(shopPrice(n)),
      fmtDelta: (n: number) => nf.format(n),
    };
  }, [locale]);

  const geo = useMemo(() => {
    // Launch-Tag: nur ein History-Punkt → zu einer flachen Linie verdoppeln,
    // damit der Chart nicht komplett verschwindet.
    const history =
      raw.length === 1
        ? [
            raw[0],
            {
              ...raw[0],
              t: new Date(new Date(raw[0].t).getTime() + 3_600_000).toISOString(),
            },
          ]
        : raw;
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const prices = history.map((p) => p.price);
    const dataMax = Math.max(...prices);
    const yMin = Math.max(0, floorEuro - 0.5);
    const yMax = dataMax * 1.08;
    const t0 = new Date(history[0].t).getTime();
    const t1 = new Date(history[history.length - 1].t).getTime();
    const tSpan = Math.max(t1 - t0, 1);
    const pts = history.map((p) => ({
      x: PAD.left + ((new Date(p.t).getTime() - t0) / tSpan) * iw,
      y: PAD.top + (1 - (p.price - yMin) / (yMax - yMin)) * ih,
      p,
    }));
    return { iw, ih, yMin, yMax, pts };
  }, [raw, floorEuro]);

  // Am Launch-Tag existiert nur EIN Punkt — dann eine flache Linie zeigen,
  // statt den Chart ganz verschwinden zu lassen.
  if (raw.length === 0) return null;

  const { ih, yMin, yMax, pts } = geo;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ih;
  const color = erfolg ? UP : DOWN;
  const gradId = erfolg ? "tickerAreaUp" : "tickerAreaDown";
  const gridSteps = [0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const floorY = y(floorEuro);
  const linePath = linePathOf(pts);
  const areaPath = `${linePath} L ${(W - PAD.right).toFixed(1)} ${(PAD.top + ih).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + ih).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  // ATH/ATL direkt am Chart annotieren
  const athPt = pts.reduce((a, b) => (b.p.price > a.p.price ? b : a));
  const atlPt = pts.reduce((a, b) => (b.p.price < a.p.price ? b : a));

  // Pointer → nächstliegender Datenpunkt (binäre Suche unnötig, Punktzahl klein)
  function onPointer(e: React.PointerEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  }

  const hv = hover !== null ? pts[hover] : null;
  // Delta zum Vorgänger-Punkt: macht jeden Punkt zur Mini-Story (Kauf/Flaute)
  const hvDelta =
    hover !== null && hover > 0
      ? pts[hover].p.price - pts[hover - 1].p.price
      : null;
  const hvDate = hv
    ? new Date(hv.p.t).toLocaleDateString(locale === "en" ? "en-GB" : "de-AT", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  // Tooltip-Position in % (skaliert mit responsivem SVG)
  // In den sichtbaren Bereich klemmen, sonst wird der Tooltip am Rand abgeschnitten
  const tipLeft = hv ? Math.min(88, Math.max(12, (hv.x / W) * 100)) : 0;
  const tipTop = hv ? Math.max(14, (hv.y / H) * 100) : 0;

  return (
    <div
      ref={wrapRef}
      className="relative touch-pan-y"
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${labels.start}: ${fmt(raw[0].price)} — ${labels.today}: ${fmt(raw[raw.length - 1].price)}`}
      >
        <defs>
          {/* Fläche läuft schnell auf null aus — kein „brauner Block" unter hoher Kurve */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="45%" stopColor={color} stopOpacity="0.03" />
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
              fontSize="13"
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
          fontSize="13"
          fill={INK_MUTED}
        >
          {labels.floor.replace("{price}", fmt(floorEuro))}
        </text>

        {/* Fläche + weiche Kurs-Linie (zeichnet sich beim Reveal ein) */}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="animate-chart-draw"
        />

        {/* ATH/ATL-Annotationen — horizontal in den Zeichenbereich geklemmt */}
        <text
          x={Math.max(PAD.left + 44, Math.min(athPt.x, W - PAD.right - 44))}
          y={Math.max(PAD.top + 12, athPt.y - 12)}
          textAnchor="middle"
          fontSize="13"
          fill={INK_MUTED}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          ▲ {fmt(athPt.p.price)}
        </text>
        <text
          x={Math.max(PAD.left + 44, Math.min(atlPt.x, W - PAD.right - 44))}
          y={Math.min(atlPt.y + 22, PAD.top + ih - 6)}
          textAnchor="middle"
          fontSize="13"
          fill={INK_MUTED}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          ▼ {fmt(atlPt.p.price)}
        </text>

        {/* Verkaufs-Events */}
        {pts
          .filter((q) => q.p.event === "sale")
          .map((q) => (
            <circle
              key={q.p.t}
              cx={q.x}
              cy={q.y}
              r="4.5"
              fill={UP}
              stroke={SURFACE}
              strokeWidth="2"
            />
          ))}

        {/* Live-Punkt am Linienende — der Kurs lebt */}
        <circle
          cx={last.x}
          cy={last.y}
          r="10"
          fill={color}
          opacity="0.25"
          className="md:motion-safe:animate-ping [transform-box:fill-box] origin-center"
        />
        <circle
          cx={last.x}
          cy={last.y}
          r="5"
          fill={color}
          stroke={SURFACE}
          strokeWidth="2"
        />

        {/* Crosshair */}
        {hv && (
          <g>
            <line
              x1={hv.x}
              x2={hv.x}
              y1={PAD.top}
              y2={PAD.top + ih}
              stroke={INK_MUTED}
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <circle
              cx={hv.x}
              cy={hv.y}
              r="5.5"
              fill={color}
              stroke={SURFACE}
              strokeWidth="2"
            />
          </g>
        )}

        {/* Zeit-Endpunkte */}
        <text x={PAD.left} y={H - 8} fontSize="13" fill={INK_MUTED}>
          {labels.start}
        </text>
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          fontSize="13"
          fill={INK_MUTED}
        >
          {labels.today}
        </text>
      </svg>

      {/* Tooltip (HTML, skaliert mit dem responsiven SVG) */}
      {hv && (
        <div
          className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-full pb-3"
          style={{ left: `${tipLeft}%`, top: `${tipTop}%` }}
        >
          <div className="rounded-md border border-line bg-bg-card px-3 py-2 whitespace-nowrap shadow-lg">
            <p className="text-sand tabular-nums text-sm font-medium">
              {fmt(hv.p.price)}
              {hvDelta !== null && hvDelta !== 0 && (
                <span
                  className={`ml-2 text-xs uppercase tracking-wide tabular-nums ${
                    // Gedrehte Semantik wie die Kurs-Linie: fallendes Delta
                    // (= jemand hat gekauft) ist der Erfolg und wird grün.
                    hvDelta < 0 ? "text-market-up" : "text-market-down"
                  }`}
                >
                  {hvDelta > 0 ? "+" : "−"}
                  {fmtDelta(Math.abs(hvDelta))} ·{" "}
                  {hv.p.event === "sale" ? labels.sale : labels.drift}
                </span>
              )}
            </p>
            <p className="text-sand/50 text-[11px] mt-0.5">{hvDate}</p>
          </div>
        </div>
      )}
    </div>
  );
}
