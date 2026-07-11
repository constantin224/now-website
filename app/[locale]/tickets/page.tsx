import type { Metadata } from "next";
import { getMessages, isValidLocale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { shopPrice, type TickerState } from "@/lib/ticker/engine";
import { readTicker } from "@/lib/ticker/shopify-admin";
import { PriceChart } from "@/components/ticker/price-chart";
import { TickerTape } from "@/components/ticker/ticker-tape";
import { Countdown } from "@/components/ticker/countdown";
import { HallPlan } from "@/components/ticker/hall-plan";
import { QueueGate } from "@/components/ticker/queue-gate";
import { ScrollReveal } from "@/components/scroll-reveal";

export const revalidate = 3600; // Fallback — Webhook/Tick revalidieren on-demand

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

// Verkäufe der letzten 24 h aus der Historie (Nachfrage-Badge + Volumen)
function salesLast24h(state: TickerState, now: Date): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  return state.history.filter(
    (p) => p.event === "sale" && new Date(p.t).getTime() >= cutoff
  ).length;
}

// 24h-Veränderung in Prozent
function dayChangePct(state: TickerState, now: Date): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  const before = [...state.history]
    .reverse()
    .find((p) => new Date(p.t).getTime() < cutoff);
  const ref = before?.price ?? state.history[0].price;
  return ((state.price - ref) / ref) * 100;
}

// Euro deutsch formatiert (Komma), ganze Beträge ohne Cent
const euro = (n: number) => `€${n.toFixed(2).replace(".", ",")}`;
const euroInt = (n: number) =>
  `€${Math.round(n).toLocaleString("de-AT")}`;

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = getMessages(isValidLocale(locale) ? locale : "de");
  const t = m.tickets;

  const now = new Date();
  const { state, currentInventory } = await readTicker().catch(() => ({
    state: null,
    currentInventory: 0,
  }));

  // Börse noch nicht initialisiert / API-Fehler → nüchterner Fallback
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
          <p className="text-sand/45 tracking-wide mt-2">{t.eventMeta}</p>
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
  const rising = change >= 0;
  const sales24 = salesLast24h(state, now);
  const prices = state.history.map((p) => p.price);
  const ath = Math.max(...prices);
  const atl = Math.min(...prices);
  const marketCap = price * currentInventory;
  const badge =
    sales24 >= 3
      ? t.demandBadge.high.replace("{count}", String(sales24))
      : sales24 >= 1
        ? t.demandBadge.some.replace("{count}", String(sales24))
        : t.demandBadge.none;
  const trendCls = rising ? "text-market-up" : "text-market-down";
  const arrow = rising ? "▲" : "▼";

  const tapeItems = [
    `${t.symbol} ${euro(price)} ${arrow} ${Math.abs(change).toFixed(1).replace(".", ",")} %`,
    `${t.tape.volumeLabel}: ${sales24}`,
    `${t.tape.availableLabel}: ${currentInventory} ${t.stats.availableUnit}`,
    `${t.stats.marketCap}: ${euroInt(marketCap)}`,
    `${t.tape.floorLabel}: ${euro(C.floorEuro)}`,
    `${t.tape.capLabel}: ${euro(C.capEuro)}`,
  ];

  return (
    <section className="pt-28 md:pt-36 pb-[var(--spacing-section)]">
      {/* Kopf */}
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-[10px] md:text-xs tracking-[0.25em] uppercase text-sand-38">
          {t.platformLabel}
        </p>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="font-light text-5xl md:text-7xl text-sand leading-none">
            {t.eventTitle}
          </h1>
          <span className="font-light text-xl md:text-2xl text-sand/45">
            {t.eventSubtitle}
          </span>
        </div>
        <p className="text-sm md:text-base text-sand/50 tracking-wide mt-3">
          {t.eventMeta}
        </p>
      </div>

      {/* Laufband */}
      <div className="mt-10 md:mt-14">
        <TickerTape items={tapeItems} />
      </div>

      {/* Terminal-Karte: Kurs + Stats + Chart */}
      <div className="max-w-5xl mx-auto px-6">
        <ScrollReveal className="mt-10 md:mt-14" y={24}>
          <div className="border border-line rounded-xl bg-bg-section/60 p-6 md:p-10">
            {/* Status-Zeile */}
            <div className="flex items-center gap-3">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-market-up opacity-60 md:motion-safe:animate-ping" />
                <span className="relative inline-flex rounded-full w-2 h-2 bg-market-up" />
              </span>
              <span className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-sand/55">
                {badge}
              </span>
            </div>

            {/* Kurs + Kennzahlen */}
            <div className="mt-8 grid md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-end">
              <div>
                <p className="text-[10px] md:text-xs tracking-[0.15em] uppercase text-sand-38">
                  {t.currentPrice} — {t.symbol}
                </p>
                <div className="flex items-end gap-5 mt-2">
                  <span className="font-light text-6xl md:text-8xl text-sand tabular-nums leading-none">
                    {euro(price)}
                  </span>
                  <span
                    className={`text-lg md:text-2xl tabular-nums pb-1 ${trendCls}`}
                  >
                    {arrow} {Math.abs(change).toFixed(1).replace(".", ",")} %
                    <span className="block text-[10px] md:text-xs tracking-[0.15em] uppercase text-sand-38 mt-1">
                      {t.dayChange}
                    </span>
                  </span>
                </div>
              </div>
              {/* Stat-Grid */}
              <dl className="grid grid-cols-2 gap-x-10 gap-y-4 text-right md:text-left">
                {[
                  [t.allTimeHigh, euro(ath)],
                  [t.allTimeLow, euro(atl)],
                  [
                    t.stats.available,
                    `${currentInventory} ${t.stats.availableUnit}`,
                  ],
                  [t.stats.marketCap, euroInt(marketCap)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[10px] tracking-[0.15em] uppercase text-sand-38">
                      {label}
                    </dt>
                    <dd className="text-sand/80 tabular-nums mt-1">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Chart */}
            <div className="mt-10">
              <PriceChart
                history={state.history}
                rising={rising}
                floorEuro={C.floorEuro}
                labels={t.chart}
              />
            </div>
            <p className="text-xs md:text-sm text-sand-38 mt-4">
              {t.chartTitle}
            </p>
          </div>
        </ScrollReveal>

        {/* Erklärung + Saalplan */}
        <ScrollReveal className="mt-16 md:mt-24" y={24}>
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
            <div>
              <h2 className="font-light text-2xl md:text-3xl text-sand">
                {t.howItWorksTitle}
              </h2>
              <p className="text-sand/60 leading-relaxed mt-5">
                {t.howItWorks}
              </p>
              <p className="text-sm text-sand-38 leading-relaxed mt-4">
                {t.fees}
              </p>
            </div>
            <div className="border border-line rounded-xl bg-bg-section/60 p-6 md:p-8">
              <h2 className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-sand-38 mb-5">
                {t.hallPlan.title}
              </h2>
              <HallPlan labels={t.hallPlan} />
            </div>
          </div>
        </ScrollReveal>

        {/* Countdown + CTA */}
        <ScrollReveal className="mt-16 md:mt-24" y={24}>
          <div className="text-center">
            <div className="flex justify-center">
              <Countdown targetIso={C.gigDateIso} labels={t.countdown} />
            </div>
            <div className="mt-12">
              <QueueGate
                href={C.shopProductUrl}
                label={t.buyCta}
                queue={t.queue}
              />
            </div>
            <p className="text-xs text-sand/35 mt-8 max-w-md mx-auto leading-relaxed">
              {t.disclaimer}
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
