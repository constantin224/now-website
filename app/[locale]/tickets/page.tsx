import type { Metadata } from "next";
import Image from "next/image";
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
import { ShareRate } from "@/components/ticker/share-rate";
import { Tilt } from "@/components/ticker/tilt";
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

// Verkäufe der letzten 24 h aus der Historie (Nachfrage-Zeile + Volumen)
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
  const badge =
    sales24 >= 3
      ? t.demandBadge.high.replace("{count}", String(sales24))
      : sales24 >= 1
        ? t.demandBadge.some.replace("{count}", String(sales24))
        : t.demandBadge.none;
  const trendCls = rising ? "text-market-up" : "text-market-down";
  const arrow = rising ? "▲" : "▼";
  const pct = `${Math.abs(change).toFixed(1).replace(".", ",")} %`;

  const tapeItems = [
    `${t.symbol} ${euro(price)} ${arrow} ${pct}`,
    `${t.tape.volumeLabel}: ${sales24}`,
    `${t.tape.availableLabel}: ${currentInventory} ${t.stats.availableUnit}`,
    `${t.tape.floorLabel}: ${euro(C.floorEuro)}`,
    `${t.tape.capLabel}: ${euro(C.capEuro)}`,
  ];

  const stats: [string, string][] = [
    [t.allTimeHigh, euro(ath)],
    [t.allTimeLow, euro(atl)],
    [t.stats.available, `${currentInventory} ${t.stats.availableUnit}`],
    [t.stats.sold, String(state.soldCount)],
  ];

  return (
    <>
      {/* ============ HERO — Bühne: Live-Atmosphäre + Preis als Typo-Objekt ============ */}
      <section className="relative min-h-[92svh] flex flex-col">
        {/* Hintergrund: Live-Crowd, warm, stark abgedunkelt */}
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src="/video-poster.jpg"
            alt=""
            fill
            priority
            className="object-cover opacity-60 [object-position:center_42%]"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-base/75 via-bg-base/35 to-bg-base" />
        </div>

        {/* Ein Star, wenig Text: der Preis IST das Hero */}
        <div className="relative flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto w-full px-6 pt-28 pb-16">
          <p className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-sand/45 animate-fade-in">
            {t.platformLabel}
          </p>

          <h1 className="font-light text-2xl md:text-3xl text-sand/85 mt-8 animate-fade-in">
            {t.eventTitle}
            <span className="block text-xs md:text-sm font-[family-name:var(--font-body)] tracking-wide text-sand/50 mt-2">
              {t.eventMeta}
            </span>
          </h1>

          <div className="mt-10 md:mt-14 animate-fade-in-delay">
            {/* Preis bewusst in Inter statt Serif: sofort lesbar, Ziffern klar */}
            <span className="block font-extralight text-[clamp(4.5rem,14vw,12rem)] leading-none tracking-tight text-sand tabular-nums">
              {euro(price)}
            </span>
            <p
              className={`mt-4 flex items-center justify-center gap-3 text-lg md:text-2xl tabular-nums ${trendCls}`}
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-market-up opacity-60 md:motion-safe:animate-ping" />
                <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-market-up" />
              </span>
              {arrow} {pct}
              <span className="text-[10px] md:text-xs tracking-[0.2em] uppercase text-sand-38">
                {t.live} · {t.dayChange}
              </span>
            </p>
          </div>

          {/* Ein Satz Klarheit — mehr braucht das Hero nicht */}
          <p className="mt-10 md:mt-12 max-w-lg text-base md:text-lg text-sand/70 leading-relaxed animate-fade-in-delay">
            {t.heroTagline}
          </p>
          <p className="text-sm text-sand/50 mt-3 animate-fade-in-delay">
            {t.nextDrop}
          </p>
        </div>

        {/* Laufband als Hero-Abschluss */}
        <div className="relative">
          <TickerTape items={tapeItems} />
        </div>
      </section>

      {/* ============ CHART — Der Markt als Kunstobjekt ============ */}
      <section className="pt-[var(--spacing-section)]">
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal y={24}>
            <div className="flex items-center gap-3">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-market-up opacity-60 md:motion-safe:animate-ping" />
                <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-market-up" />
              </span>
              <p className="text-[10px] md:text-xs tracking-[0.25em] uppercase text-sand/50">
                {badge}
              </p>
            </div>
            <h2 className="font-light text-[length:var(--text-h2)] text-sand mt-5 max-w-2xl">
              {t.chartHeadline}
            </h2>
            {/* Terminal-Kopfzeile: seriöse Börsen-Optik, absurder Inhalt */}
            <p className="text-[10px] md:text-xs tracking-[0.25em] uppercase text-sand/45 tabular-nums border-b border-line pb-3 mt-8">
              {t.terminalLine}
            </p>
          </ScrollReveal>
        </div>

        <ScrollReveal className="mt-10 md:mt-14" y={24}>
          {/* Rahmenlos, volle Breite, leichtes Glühen (nur Desktop) */}
          <Tilt className="max-w-6xl mx-auto px-6 md:[filter:drop-shadow(0_0_24px_rgba(192,133,82,0.18))]">
            <PriceChart
              history={state.history}
              rising={rising}
              floorEuro={C.floorEuro}
              locale={locale}
              labels={t.chart}
            />
          </Tilt>
        </ScrollReveal>

        {/* Stats als eine ruhige Hairline-Zeile */}
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal y={16}>
            <dl className="mt-10 md:mt-12 grid grid-cols-2 md:grid-cols-4 gap-y-6 border-t border-line pt-6">
              {stats.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] tracking-[0.2em] uppercase text-sand/45">
                    {label}
                  </dt>
                  <dd className="tabular-nums text-2xl md:text-3xl font-light mt-2 text-sand">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs md:text-sm text-sand/50 max-w-2xl">
                {t.chartTitle} {t.chartHint}
              </p>
              <ShareRate
                text={t.shareText.replace("{price}", euro(price))}
                label={t.share}
                doneLabel={t.shared}
              />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ============ EDITORIAL — Markt-Erklärung + Saalplan als Beilage ============ */}
      <section className="pt-[var(--spacing-section)]">
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal y={24}>
            <div className="grid md:grid-cols-12 gap-12 md:gap-8 items-start border-t border-line pt-[var(--spacing-block)]">
              <div className="md:col-span-5">
                <h2 className="font-light text-[length:var(--text-h2)] text-sand leading-tight">
                  {t.howItWorksTitle}
                </h2>
                <p className="text-sand/60 leading-relaxed mt-6 max-w-md">
                  {t.howItWorks}
                </p>
                <p className="text-sm text-sand/50 leading-relaxed mt-5 max-w-md">
                  {t.fees}
                </p>
              </div>
              <div className="md:col-span-6 md:col-start-7">
                <p className="text-[10px] tracking-[0.25em] uppercase text-sand-38 mb-6">
                  {t.hallPlan.title}
                </p>
                <HallPlan labels={t.hallPlan} />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ============ FINALE — Band-Foto, Countdown, CTA ============ */}
      <section className="relative mt-[var(--spacing-section)]">
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src="/band-photo.jpg"
            alt=""
            fill
            className="object-cover object-top opacity-35"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-base via-bg-base/55 to-bg-base" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-[var(--spacing-section-lg)] text-center">
          <ScrollReveal y={24}>
            <h2 className="font-light text-[length:var(--text-h1)] text-sand leading-tight max-w-3xl mx-auto">
              {t.closingLine}
            </h2>
            <div className="flex justify-center mt-12">
              <Countdown targetIso={C.gigDateIso} labels={t.countdown} />
            </div>
            <div className="mt-12">
              <p className="text-[10px] tracking-[0.25em] uppercase text-sand/45 mb-4">
                {t.queueStatus}
              </p>
              <QueueGate
                href={C.shopProductUrl}
                label={t.buyCta}
                queue={t.queue}
              />
            </div>
            <p className="text-xs text-sand/50 mt-10 max-w-md mx-auto leading-relaxed">
              {t.disclaimer}
            </p>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
