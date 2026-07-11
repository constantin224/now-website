import type { Metadata } from "next";
import { getMessages, isValidLocale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { shopPrice, type TickerState } from "@/lib/ticker/engine";
import { readTicker } from "@/lib/ticker/shopify-admin";
import { PriceChart } from "@/components/ticker/price-chart";
import { Countdown } from "@/components/ticker/countdown";
import { HallPlan } from "@/components/ticker/hall-plan";
import { QueueGate } from "@/components/ticker/queue-gate";
import { ScrollReveal } from "@/components/scroll-reveal";

export const revalidate = 3600; // Fallback — Webhook/Tick revalidieren on-demand

// Erd-Palette-Trendfarben (identisch zu price-chart.tsx):
// Gewinn = gedämpftes Salbeigrün, Verlust = Terracotta.
const upClass = "text-[#87a06d]";
const downClass = "text-terracotta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const m = getMessages(isValidLocale(locale) ? locale : "de");
  return {
    title: m.tickets.metaTitle,
    ...localeMetadata(isValidLocale(locale) ? locale : "de", "/tickets"),
  };
}

// Verkäufe der letzten 24 h aus der Historie zählen (für Nachfrage-Badge)
function salesLast24h(state: TickerState, now: Date): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  return state.history.filter(
    (p) => p.event === "sale" && new Date(p.t).getTime() >= cutoff
  ).length;
}

// 24h-Veränderung in Prozent (für die grün/rote Kennzahl)
function dayChangePct(state: TickerState, now: Date): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  const before = [...state.history]
    .reverse()
    .find((p) => new Date(p.t).getTime() < cutoff);
  const ref = before?.price ?? state.history[0].price;
  return ((state.price - ref) / ref) * 100;
}

// Euro-Betrag deutsch formatiert (Komma statt Punkt)
const euro = (n: number) => `€${n.toFixed(2).replace(".", ",")}`;

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = getMessages(isValidLocale(locale) ? locale : "de");
  const t = m.tickets;

  const now = new Date();
  const { state } = await readTicker().catch(() => ({ state: null }));

  // Börse noch nicht initialisiert / API-Fehler → nüchterner Fallback mit Shop-Link
  if (!state) {
    return (
      <section className="pt-28 md:pt-36 pb-[var(--spacing-section)] px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-sand-38">
            {t.platformLabel}
          </p>
          <h1 className="font-light text-4xl md:text-6xl text-sand mt-6">
            {t.eventTitle}
          </h1>
          <p className="text-sand/45 tracking-wide mt-2">{t.eventSubtitle}</p>
          <a
            href={C.shopProductUrl}
            className="inline-block border border-terracotta/30 bg-terracotta/10 text-terracotta px-8 py-3 text-[11px] tracking-[3px] uppercase hover:bg-terracotta/20 transition-colors rounded-full mt-10"
          >
            {t.buyCta}
          </a>
        </div>
      </section>
    );
  }

  const price = shopPrice(state.price);
  const change = dayChangePct(state, now);
  const sales24 = salesLast24h(state, now);
  const prices = state.history.map((p) => p.price);
  const ath = Math.max(...prices);
  const atl = Math.min(...prices);
  const badge =
    sales24 >= 3
      ? t.demandBadge.high.replace("{count}", String(sales24))
      : sales24 >= 1
        ? t.demandBadge.some.replace("{count}", String(sales24))
        : t.demandBadge.none;
  const rising = change >= 0;

  return (
    <section className="pt-28 md:pt-36 pb-[var(--spacing-section)] px-6">
      <div className="max-w-4xl mx-auto">
        {/* Kopf — Plattform-Label + Event-Titel (sofort sichtbar, kein Reveal) */}
        <p className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-sand-38">
          {t.platformLabel}
        </p>
        <h1 className="font-light text-4xl md:text-6xl text-sand mt-4">
          {t.eventTitle}
        </h1>
        <p className="text-sand/45 tracking-wide mt-2">{t.eventSubtitle}</p>

        {/* Nachfrage-Badge als Terracotta-Pille (Marken-Idiom) */}
        <div className="mt-10">
          <span className="inline-block border border-terracotta/30 bg-terracotta/10 text-terracotta text-[10px] md:text-xs tracking-[0.2em] uppercase px-4 py-2 rounded-full">
            {badge}
          </span>
        </div>

        {/* Aktueller Marktpreis + 24h-Veränderung */}
        <ScrollReveal className="mt-16" y={40}>
          <p className="text-[10px] md:text-xs tracking-[0.15em] uppercase text-sand-38">
            {t.currentPrice}
          </p>
          <div className="flex items-end gap-6 mt-3">
            <span className="font-light text-6xl md:text-8xl text-sand tabular-nums">
              {euro(price)}
            </span>
            <span
              className={`text-xl md:text-2xl tabular-nums ${
                rising ? upClass : downClass
              }`}
            >
              {rising ? "▲" : "▼"} {Math.abs(change).toFixed(1)} %
            </span>
          </div>
          <p className="text-xs text-sand-38 tracking-wide mt-3">{t.dayChange}</p>
        </ScrollReveal>

        {/* Preisentwicklung — Chart + Allzeithoch/-tief */}
        <ScrollReveal className="mt-20" delay={0.1}>
          <h2 className="font-light text-lg md:text-xl text-sand/70 mb-6">
            {t.chartTitle}
          </h2>
          <PriceChart history={state.history} />
          <div className="flex flex-wrap gap-x-10 gap-y-2 mt-4 text-sm text-sand-38 tabular-nums">
            <span>
              {t.allTimeHigh}: {euro(ath)}
            </span>
            <span>
              {t.allTimeLow}: {euro(atl)}
            </span>
          </div>
        </ScrollReveal>

        {/* Erklärung */}
        <ScrollReveal className="mt-20 max-w-xl" delay={0.1}>
          <p className="text-sand/60 leading-relaxed">{t.howItWorks}</p>
        </ScrollReveal>

        {/* Saalplan-Parodie — exakt eine Fläche */}
        <ScrollReveal className="mt-16" delay={0.1}>
          <HallPlan labels={t.hallPlan} />
        </ScrollReveal>

        {/* Countdown bis zum Gig */}
        <ScrollReveal className="mt-16" delay={0.1}>
          <Countdown targetIso={C.gigDateIso} labels={t.countdown} />
        </ScrollReveal>

        {/* CTA (Fake-Warteschlange) + Gebühren-Fußnote */}
        <ScrollReveal className="mt-14" delay={0.1}>
          <QueueGate href={C.shopProductUrl} label={t.buyCta} queue={t.queue} />
          <p className="text-sm text-sand-38 mt-6 max-w-xl leading-relaxed">
            {t.fees}
          </p>
          <p className="text-xs text-sand/35 mt-3 max-w-xl leading-relaxed">
            {t.disclaimer}
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
