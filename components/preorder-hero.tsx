import Image from "next/image";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n";
import { formatPrice } from "@/lib/shopify";
import { albumPreorder, isPreorderPhase } from "@/data/preorder";

// Hervorgehobene Album-Karte (Preorder → nach VÖ „Jetzt bestellen").
// Server-Component, keine Animation (Mobile statisch per Hausregel).
export function PreorderHero({ locale }: { locale: Locale }) {
  const t = getMessages(locale).shop;
  const preorder = isPreorderPhase();
  const [y, m, d] = albumPreorder.releaseDate.split("-");
  const releaseLabel = locale === "de" ? `${d}.${m}.${y}` : `${m}/${d}/${y}`;

  return (
    <a
      href={albumPreorder.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group grid grid-cols-1 sm:grid-cols-[minmax(0,280px)_1fr] gap-6 sm:gap-10 items-center border border-terracotta/25 rounded-xl p-5 sm:p-7 mb-16 bg-bg-card/60 hover:border-terracotta/50 transition-colors"
    >
      <div className="relative aspect-square rounded-lg overflow-hidden shadow-lg shadow-black/30 bg-bg-card">
        <Image
          src={albumPreorder.cover}
          alt={`Now. – ${albumPreorder.title} Album Cover`}
          fill
          sizes="(max-width: 640px) 90vw, 280px"
          className="object-cover"
          unoptimized
        />
      </div>
      <div>
        <p className="text-terracotta text-[10px] tracking-[2px] uppercase mb-3">
          {preorder ? `${t.preorder_label} · ${t.release_on} ${releaseLabel}` : `${t.out_now_label} · ${releaseLabel}`}
        </p>
        <h2 className="font-heading font-light text-sand text-3xl md:text-4xl leading-tight mb-2">
          {`Now. – „${albumPreorder.title}“`}
        </h2>
        <p className="text-sand/50 text-sm mb-5">{t.preorder_desc}</p>
        <ul className="text-sand/70 text-sm space-y-1 mb-6">
          {albumPreorder.formats.map((f) => (
            <li key={f.de} className="flex justify-between max-w-xs border-b border-line pb-1">
              <span>{f[locale]}</span>
              <span className="text-terracotta">{formatPrice(f.price, "EUR")}</span>
            </li>
          ))}
        </ul>
        <span className="inline-flex items-center rounded-full bg-terracotta text-bg-base font-semibold text-[10px] tracking-[2px] uppercase px-6 py-2.5 group-hover:bg-terracotta/85 transition-colors">
          {preorder ? t.preorder_cta : t.out_now_cta} →
        </span>
      </div>
    </a>
  );
}
