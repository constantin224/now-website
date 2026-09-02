"use client";

import { useMemo, useRef, useState } from "react";
import { shopPrice, type HistoryPoint } from "@/lib/ticker/engine";
import { aggregateDays, formatDay } from "@/lib/ticker/chart-days";

interface Props {
  history: HistoryPoint[];
  /** Der Live-Kurs — der heutige Punkt des Charts. */
  currentPrice: number;
  /** Request-Zeit als ISO-String (Server und Client rechnen denselben „heute"). */
  nowIso: string;
  /**
   * Lage der 24h-Kennzahl. Farb-Semantik gegenüber einem echten Börsen-Chart
   * bewusst GEDREHT: "down" = die Community kauft den Preis runter = grün;
   * "up" = Flaute = terracotta; "flat" = neutral. Pfeil und Vorzeichen tragen
   * die echte Richtung (nie farb-allein).
   */
  trend: "down" | "flat" | "up";
  floorEuro: number;
  locale: string;
  labels: {
    floor: string;
    start: string;
    today: string;
    ticket: string; // "{n} Ticket"
    tickets: string; // "{n} Tickets"
  };
}

// Trendfarben identisch zu den Theme-Tokens --color-market-up/-down.
// Nie farb-allein: Pfeil/Vorzeichen und Marker tragen die Information zusätzlich.
const UP = "#9cb579";
const DOWN = "#c08552";
const FLAT = "#a89f92"; // neutral (Sand, gedimmt) — Stillstand ist keine Flaute
const GRID = "rgba(212, 203, 190, 0.07)";
const INK_MUTED = "rgba(212, 203, 190, 0.42)";
const SURFACE = "#161210";

const W = 960;
const H = 400;
// Unten Platz für zwei Zeilen: Ticketzahl je Tag + Datum
const PAD = { top: 34, right: 20, bottom: 52, left: 62 };

// Linear verbunden — bei Kurs-Daten Best Practice: kein Smoothing,
// das Zwischenwerte erfindet oder an Sprüngen überschwingt.
function linePathOf(pts: { x: number; y: number }[]): string {
  return `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`;
}

/**
 * Tagesansicht (seit 02.09.): ein Punkt pro Kalendertag, Kurs am Tagesende,
 * darunter die verkauften Tickets des Tages. Constantin: „nicht genau mit
 * Uhrzeit, sondern immer Tag und Ticketkauf". Die Uhrzeit-Historie bleibt im
 * Zustand — hier wird nur anders gezeigt (lib/ticker/chart-days.ts).
 */
export function PriceChart({
  history,
  currentPrice,
  nowIso,
  trend,
  floorEuro,
  locale,
  labels,
}: Props) {
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
    const tage = aggregateDays(history, nowIso, currentPrice);
    // Launch-Tag: nur ein Tag → zu einer flachen Linie verdoppeln, damit der
    // Chart nicht komplett verschwindet.
    const days = tage.length === 1 ? [tage[0], { ...tage[0] }] : tage;
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const prices = days.map((d) => d.price);
    const dataMax = Math.max(...prices);
    const dataMin = Math.min(...prices);
    // Y-Achse ZOOMT AUF DIE DATEN statt immer bis zum Boden zu spannen:
    // Mindestspanne 5 €, damit ein 1-€-Community-Sprung sichtbar bleibt
    // (20 % der Höhe) und Cent-Drifts flach. Die Boden-Linie kommt automatisch
    // ins Bild, sobald der Kurs ihr nahekommt (yMin klemmt nie unter floor − 0,5).
    let yMin = dataMin - 0.75;
    let yMax = dataMax + 0.75;
    const fehlt = 5 - (yMax - yMin);
    if (fehlt > 0) {
      yMin -= fehlt / 2;
      yMax += fehlt / 2;
    }
    yMin = Math.max(yMin, floorEuro - 0.5);
    const yOf = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ih;
    // Tage gleich breit — Zeit bleibt linear, nur ohne Uhrzeit-Zittern.
    const pts = days.map((d, i) => ({
      x: PAD.left + (i / (days.length - 1)) * iw,
      y: yOf(d.price),
      d,
    }));
    // Datums-Beschriftung: ~5 Stützstellen + „Heute" ganz rechts; kein Datum
    // direkt neben „Heute" (sonst überlappt es).
    const step = Math.max(1, Math.ceil((days.length - 1) / 5));
    const dateIdx = pts
      .map((_, i) => i)
      .filter((i) => i % step === 0 && i < days.length - 1 && days.length - 1 - i > step / 2);
    return { iw, ih, yMin, yMax, pts, dateIdx };
  }, [history, nowIso, currentPrice, floorEuro]);

  if (history.length === 0) return null;

  const { ih, yMin, yMax, pts, dateIdx } = geo;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ih;
  const color = trend === "down" ? UP : trend === "up" ? DOWN : FLAT;
  const gradId =
    trend === "down" ? "tickerAreaUp" : trend === "up" ? "tickerAreaDown" : "tickerAreaFlat";
  const gridSteps = [0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  // Boden-Linie nur zeichnen, wenn der Boden im sichtbaren Ausschnitt liegt
  const zeigeBoden = floorEuro >= yMin;
  const floorY = y(floorEuro);
  const linePath = linePathOf(pts);
  const areaPath = `${linePath} L ${(W - PAD.right).toFixed(1)} ${(PAD.top + ih).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + ih).toFixed(1)} Z`;
  const first = pts[0];
  const last = pts[pts.length - 1];
  // ATH/ATL direkt am Chart annotieren (erster Tag mit dem Extrem)
  const athPt = pts.reduce((a, b) => (b.d.price > a.d.price ? b : a));
  const atlPt = pts.reduce((a, b) => (b.d.price < a.d.price ? b : a));
  const ticketLabel = (n: number) => (n === 1 ? labels.ticket : labels.tickets).replace("{n}", String(n));

  // Pointer → nächstliegender Tag
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
  // Delta zum Vortag: macht jeden Tag zur Mini-Story (Käufe drücken, Flaute hebt)
  const hvDelta = hover !== null && hover > 0 ? pts[hover].d.price - pts[hover - 1].d.price : null;
  const hvDate = hv ? (hv.d.heute ? labels.today : formatDay(hv.d.key, locale, true)) : "";
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
        aria-label={`${labels.start}: ${fmt(first.d.price)} — ${labels.today}: ${fmt(last.d.price)}`}
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

        {/* Boden-Linie — der lächerliche Ernst des Marktes. Erscheint erst,
            wenn die Community den Kurs in ihre Nähe gekauft hat. */}
        {zeigeBoden && (
          <>
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
          </>
        )}

        {/* Fläche + Kurs-Linie (zeichnet sich beim Reveal ein) */}
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
          ▲ {fmt(athPt.d.price)}
        </text>
        <text
          x={Math.max(PAD.left + 44, Math.min(atlPt.x, W - PAD.right - 44))}
          y={Math.min(atlPt.y + 22, PAD.top + ih - 6)}
          textAnchor="middle"
          fontSize="13"
          fill={INK_MUTED}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          ▼ {fmt(atlPt.d.price)}
        </text>

        {/* Kauf-Tage: Punkt auf der Linie + Ticketzahl unter der Achse */}
        {pts
          .filter((q) => q.d.tickets > 0)
          .map((q) => (
            <g key={q.d.key}>
              <circle cx={q.x} cy={q.y} r="4.5" fill={UP} stroke={SURFACE} strokeWidth="2" />
              <text
                x={q.x}
                y={PAD.top + ih + 18}
                textAnchor="middle"
                fontSize="13"
                fontWeight="500"
                fill={UP}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {q.d.tickets}
              </text>
            </g>
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
        <circle cx={last.x} cy={last.y} r="5" fill={color} stroke={SURFACE} strokeWidth="2" />

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
            <circle cx={hv.x} cy={hv.y} r="5.5" fill={color} stroke={SURFACE} strokeWidth="2" />
          </g>
        )}

        {/* Datums-Achse: einige Tage + „Heute" */}
        {dateIdx.map((i) => (
          <text
            key={pts[i].d.key}
            x={pts[i].x}
            y={H - 8}
            textAnchor={i === 0 ? "start" : "middle"}
            fontSize="13"
            fill={INK_MUTED}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatDay(pts[i].d.key, locale)}
          </text>
        ))}
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="13" fill={INK_MUTED}>
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
              {fmt(hv.d.price)}
              {hvDelta !== null && hvDelta !== 0 && (
                <span
                  className={`ml-2 text-xs tabular-nums ${
                    // Gedrehte Semantik wie die Kurs-Linie: fallender Kurs
                    // (= es wurde gekauft) ist der Erfolg und wird grün.
                    hvDelta < 0 ? "text-market-up" : "text-market-down"
                  }`}
                >
                  {hvDelta > 0 ? "+" : "−"}
                  {fmtDelta(Math.abs(hvDelta))}
                </span>
              )}
            </p>
            <p className="text-sand/50 text-[11px] mt-0.5">
              {hvDate}
              {hv.d.tickets > 0 && (
                <>
                  {" · "}
                  <span className="text-market-up">{ticketLabel(hv.d.tickets)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
