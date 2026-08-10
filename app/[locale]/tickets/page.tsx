import type { Metadata } from "next";
import Image from "next/image";
import { getMessages, isValidLocale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { priceOf, shopPrice, type TickerState } from "@/lib/ticker/engine";
import { readTicker } from "@/lib/ticker/shopify-admin";
import { PriceChart } from "@/components/ticker/price-chart";
import { PriceHero } from "@/components/ticker/price-hero";
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

// Verkaufte TICKETS der letzten 24 h (nicht: Anzahl der Ereignisse — eine
// Bestellung über sechs Tickets ist EIN Ereignis, aber sechs Tickets)
function salesLast24h(state: TickerState, now: Date): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  return state.history
    .filter((p) => p.event === "sale" && new Date(p.t).getTime() >= cutoff)
    .reduce((sum, p) => sum + (p.qty ?? 1), 0);
}

// 24h-Veränderung in Prozent — gemessen gegen den PREIS, DER ANGEZEIGT WIRD.
// Sonst behauptet die Seite einen Trend, der zum sichtbaren Kurs nicht passt.
function dayChangePct(state: TickerState, now: Date, aktuell: number): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  const before = [...state.history]
    .reverse()
    .find((p) => new Date(p.t).getTime() < cutoff);
  const ref = before?.price ?? state.history[0].price;
  if (!ref) return 0; // niemals durch null teilen
  return ((aktuell - ref) / ref) * 100;
}

// Beträge in der Sprache des Besuchers — auf der EN-Seite mit Punkt, nicht Komma
function euroIn(locale: string) {
  const fmt = new Intl.NumberFormat(locale === "en" ? "en-IE" : "de-AT", {
    style: "currency",
    currency: "EUR",
  });
  return (n: number) => fmt.format(n);
}

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = getMessages(isValidLocale(locale) ? locale : "de");
  const t = m.tickets;

  const euro = euroIn(locale);
  const now = new Date();
  const { state, currentInventory, currentPriceEuro } = await readTicker().catch(
    (err) => {
      // Fehler sichtbar machen — sonst sieht ein echter Shopify-Ausfall genauso
      // aus wie "Börse noch nicht gestartet".
      console.error("[tickets] readTicker fehlgeschlagen:", err);
      return { state: null, currentInventory: 0, currentPriceEuro: 0 };
    }
  );

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

  // Angezeigt wird, was der Shop WIRKLICH verlangt — unverändert, nicht durch
  // die eigene Preislogik geklemmt. Stünde im Shop aus irgendeinem Grund ein
  // Preis außerhalb von Boden und Deckel, wäre es eine Lüge, ihn auf 25 €
  // zurechtzurunden: Der Checkout verlangt trotzdem den echten Betrag.
  // (Nur falls Shopify gar keinen brauchbaren Preis liefert: abgeleiteter Kurs.)
  const price = currentPriceEuro > 0 ? currentPriceEuro : shopPrice(priceOf(state, new Date()));
  const change = dayChangePct(state, now, price);
  const rising = change >= 0;
  // Farb-Semantik ist hier GEDREHT: Ein fallender Kurs ist der Erfolg — die
  // Community kauft den Preis runter. Er bekommt deshalb das Grün; Steigen
  // heißt Flaute. Der Pfeil zeigt weiterhin die echte Richtung (nie
  // farb-allein, siehe price-chart.tsx).
  const erfolg = !rising;
  const sales24 = salesLast24h(state, now);
  // Historische Kurse als SHOP-Preis (10-Cent-Rundung) — so, wie sie damals im
  // Shop standen. Der aktuelle Preis gehört dazu, sonst könnte der Höchststand
  // unter dem liegen, was der Hero gerade anzeigt.
  const prices = [...state.history.map((p) => shopPrice(p.price)), price];
  const ath = Math.max(...prices);
  const atl = Math.min(...prices);
  const badge =
    sales24 >= 3
      ? t.demandBadge.high.replace("{count}", String(sales24))
      : sales24 >= 1
        ? t.demandBadge.some.replace("{count}", String(sales24))
        : t.demandBadge.none;
  const trendCls = erfolg ? "text-market-up" : "text-market-down";
  const arrow = rising ? "▲" : "▼";
  const pct = `${Math.abs(change).toFixed(1).replace(".", ",")} %`;

  // Laufband in Klartext — jeder Eintrag ohne Börsen-Jargon verständlich
  const tapeItems = [
    t.tape.price
      .replace("{price}", euro(price))
      .replace("{arrow}", arrow)
      .replace("{pct}", pct),
    t.tape.sold24h.replace("{n}", String(sales24)),
    t.tape.available.replace("{n}", String(currentInventory)),
    t.tape.floor.replace("{price}", euro(C.floorEuro)),
    t.tape.cap.replace("{price}", euro(C.capEuro)),
  ];

  // Hero-Animation: 12 echte Kurs-Stationen von Handelsstart bis jetzt
  const step = Math.max(1, Math.floor(state.history.length / 12));
  const heroWaypoints = [
    ...state.history.filter((_, i) => i % step === 0).map((p) => p.price),
    price,
  ];

  const stats: [string, string][] = [
    [t.allTimeHigh, euro(ath)],
    [t.allTimeLow, euro(atl)],
    [t.stats.available, `${currentInventory} ${t.stats.availableUnit}`],
    // soldCount kann negativ sein (Alt-Storno unter die Baseline, siehe Engine) —
    // "-1 verkauft" wäre für Besucher nur verwirrend, also bei 0 klemmen.
    [t.stats.sold, String(Math.max(0, state.soldCount))],
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
          <h1 className="font-light text-2xl md:text-3xl text-sand/85 animate-fade-in">
            {t.eventTitle}
            <span className="block text-xs md:text-sm font-[family-name:var(--font-body)] tracking-wide text-sand/50 mt-2">
              {t.eventMeta}
            </span>
          </h1>

          <div className="mt-10 md:mt-14 animate-fade-in-delay">
            <p className="text-[10px] md:text-xs tracking-[0.25em] uppercase text-sand/55 mb-4">
              {t.priceEyebrow}
            </p>
            {/* Preis bewusst in Inter statt Serif: sofort lesbar, Ziffern klar.
                Tickt beim Laden durch die echte Kurshistorie — Dynamik sichtbar. */}
            <PriceHero
              waypoints={heroWaypoints}
              locale={locale}
              className="block font-extralight text-[clamp(4.5rem,14vw,12rem)] leading-none tracking-tight text-sand tabular-nums"
            />
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

          {/* Kauf-Fokus: CTA direkt im Hero */}
          <div className="mt-10 animate-fade-in-delay">
            <QueueGate
              href={C.shopProductUrl}
              label={t.buyCta}
              queue={t.queue}
            />
            <p className="text-xs text-sand/50 mt-4 max-w-sm mx-auto">
              {t.ctaPriceNote}
            </p>
          </div>
        </div>

        {/* Laufband als Hero-Abschluss */}
        <div className="relative">
          <TickerTape items={tapeItems} />
        </div>
      </section>

      {/* ============ LIVE-BETRACHTER — Fake-Andrang, offen absurd ============ */}
      <div className="px-6 pt-[var(--spacing-block)]">
        <p className="mx-auto flex max-w-2xl items-center justify-center gap-2.5 text-center text-xs md:text-sm text-sand/45">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-market-up opacity-60 md:motion-safe:animate-ping" />
            <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-market-up" />
          </span>
          {t.liveViewers}
        </p>
      </div>

      {/* ============ SO FUNKTIONIERT'S — Erklärung links, Chart als Beweis rechts ============ */}
      <section className="pt-[var(--spacing-section)]">
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal y={24}>
            <div className="grid md:grid-cols-12 gap-12 md:gap-10 items-center">
              <div className="md:col-span-5">
                <div className="flex items-center gap-3">
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-market-up opacity-60 md:motion-safe:animate-ping" />
                    <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-market-up" />
                  </span>
                  <p className="text-[10px] md:text-xs tracking-[0.25em] uppercase text-sand/50">
                    {badge}
                  </p>
                </div>
                <h2 className="font-light text-[length:var(--text-h2)] text-sand leading-tight mt-5">
                  {t.howItWorksTitle}
                </h2>
                <p className="text-base md:text-xl text-sand/70 leading-relaxed mt-6 max-w-md">
                  {t.howItWorks}
                </p>
              </div>
              <div className="md:col-span-7">
                <Tilt className="md:[filter:drop-shadow(0_0_24px_rgba(192,133,82,0.18))]">
                  <PriceChart
                    history={state.history}
                    erfolg={erfolg}
                    floorEuro={C.floorEuro}
                    locale={locale}
                    labels={t.chart}
                  />
                </Tilt>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs md:text-sm text-sand/50 max-w-md">
                    {t.chartTitle}
                  </p>
                  <ShareRate
                    text={t.shareText.replace("{price}", euro(price))}
                    label={t.share}
                    doneLabel={t.shared}
                  />
                </div>
              </div>
            </div>

            {/* Stats als ruhige Hairline-Zeile unter dem Ganzen */}
            <dl className="mt-14 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-y-6 border-t border-line pt-6">
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
          </ScrollReveal>
        </div>
      </section>

      {/* ============ TRUST-BADGES — Zertifikats-Leiste der großen Plattformen, deadpan ============ */}
      <section className="pt-[var(--spacing-section)]">
        <div className="max-w-5xl mx-auto px-6">
          <ScrollReveal y={16}>
            <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 border-y border-line py-6">
              {t.trust.badges.map((b) => (
                <li
                  key={b.text}
                  className="flex items-baseline gap-2 text-[11px] md:text-xs tracking-[0.15em] uppercase text-sand/60"
                >
                  <span className="text-terracotta">✓</span>
                  <span>{b.text}</span>
                  {b.note && (
                    <span className="normal-case tracking-normal text-sand-38 italic">
                      ({b.note})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {/* ============ SAALPLAN + VIP-PACKAGES ============ */}
      <section className="pt-[var(--spacing-section)]">
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal y={24}>
            <div className="grid md:grid-cols-12 gap-12 md:gap-8 items-start border-t border-line pt-[var(--spacing-block)]">
              <div className="md:col-span-6">
                <p className="text-[10px] tracking-[0.25em] uppercase text-sand-38 mb-6">
                  {t.hallPlan.title}
                </p>
                <HallPlan labels={t.hallPlan} />
              </div>
              <div className="md:col-span-5 md:col-start-8">
                <p className="text-[10px] tracking-[0.25em] uppercase text-sand-38 mb-6">
                  {t.vipTitle}
                </p>
                <ul className="space-y-6">
                  {t.vip.map((v) => (
                    <li key={v.name} className="border-b border-line pb-5">
                      <p className="text-sm tracking-[0.1em] text-sand/85">
                        {v.name}
                      </p>
                      <p className="text-sm text-sand/55 leading-relaxed mt-1.5">
                        {v.desc}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ============ BEWERTUNGEN — Trustpilot-Parodie ============ */}
      <section className="pt-[var(--spacing-section)]">
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal y={24}>
            <div className="border-t border-line pt-[var(--spacing-block)]">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <p className="text-[10px] tracking-[0.25em] uppercase text-sand-38">
                  {t.reviews.eyebrow}
                </p>
                <p className="text-xs text-sand/45 tabular-nums">
                  {t.reviews.aggregate}
                </p>
              </div>
              <ul className="grid md:grid-cols-3 gap-10 md:gap-8 mt-10">
                {t.reviews.items.map((r) => (
                  <li key={r.quote}>
                    <p
                      className="text-terracotta/80 tracking-[0.3em] text-sm"
                      aria-hidden
                    >
                      {"★".repeat(r.stars)}
                      <span className="text-sand/20">
                        {"★".repeat(5 - r.stars)}
                      </span>
                    </p>
                    <span className="sr-only">
                      {t.reviews.starsSr.replace("{stars}", String(r.stars))}
                    </span>
                    <p className="text-base md:text-lg text-sand/75 font-light italic leading-relaxed mt-4">
                      {r.quote}
                    </p>
                    <p className="text-xs text-sand-38 mt-3">— {r.by}</p>
                  </li>
                ))}
              </ul>
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
            <p className="text-xs text-sand/45 mt-5 tracking-wide">
              {t.urgencyNote}
            </p>
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
            <p className="text-sm text-sand/60 mt-8 max-w-md mx-auto leading-relaxed">
              {t.fees}
            </p>
            <p className="text-xs text-sand/50 mt-4 max-w-md mx-auto leading-relaxed">
              {t.ctaPriceNote}
            </p>
            <p className="text-xs text-sand/50 mt-3 max-w-md mx-auto leading-relaxed">
              {t.disclaimer}
            </p>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
