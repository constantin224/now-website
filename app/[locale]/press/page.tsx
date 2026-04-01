import type { Metadata } from "next";
import Image from "next/image";
import { Download } from "lucide-react";
import { getMessages, type Locale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import { ScrollReveal } from "@/components/scroll-reveal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  return {
    title: t.press.title,
    description: t.press.description,
    ...localeMetadata(locale as Locale, "/press"),
  };
}

export default async function PressPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  return (
    <section className="pt-28 md:pt-36 pb-[var(--spacing-section)] px-6 max-w-5xl mx-auto">
      {/* H1 — visuell als Section Label */}
      <h1 className="font-heading font-light text-terracotta uppercase tracking-[0.2em] text-2xl md:text-3xl text-center mb-16">
        {t.press.title}
      </h1>

      {/* Pressefotos */}
      <ScrollReveal className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <a
          href="/band-photo.jpg"
          download
          className="relative h-72 md:h-80 rounded-lg overflow-hidden group"
        >
          <Image
            src="/band-photo.jpg"
            alt="Now. — Bandfoto"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Download className="w-8 h-8 text-white" />
          </div>
        </a>
        <a
          href="/band-photo-2.jpg"
          download
          className="relative h-72 md:h-80 rounded-lg overflow-hidden group"
        >
          <Image
            src="/band-photo-2.jpg"
            alt="Now. — Bandfoto 2"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Download className="w-8 h-8 text-white" />
          </div>
        </a>
      </ScrollReveal>

      {/* Download-Link für alle Pressefotos */}
      <a
        href="/press/photos.zip"
        download
        className="inline-flex items-center gap-2 text-terracotta hover:text-sand transition-colors text-sm mb-16"
      >
        <Download className="w-4 h-4" />
        {t.press.download_all}
      </a>

      {/* Pressetext */}
      <ScrollReveal className="border-l-2 border-terracotta/30 pl-6 mb-[var(--spacing-block)] mt-12">
        <p className="text-sand/70 text-lg leading-relaxed">
          {t.press.press_bio}
        </p>
      </ScrollReveal>

      {/* Info Grid */}
      <ScrollReveal className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-[var(--spacing-block)]" delay={0.15}>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-2">
            {t.press.booking}
          </p>
          <p className="text-sand/70 text-sm mb-1">{t.press.booking_agency}</p>
          <a
            href="mailto:andreas@oton-agentur.at"
            className="text-sand/50 hover:text-sand transition-colors text-xs"
          >
            andreas@oton-agentur.at
          </a>
          <p className="text-sand/30 text-xs mt-2">
            {t.press.booking_alt}{" "}
            <a href="mailto:label@tonherd.at" className="text-sand/40 hover:text-sand/60 transition-colors">
              Tonherd Music
            </a>
          </p>
        </div>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-2">
            {t.press.management}
          </p>
          <p className="text-sand/70 text-sm mb-1">Tonherd Music</p>
          <a
            href="mailto:label@tonherd.at"
            className="text-sand/50 hover:text-sand transition-colors text-xs"
          >
            label@tonherd.at
          </a>
        </div>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-2">
            {t.press.label}
          </p>
          <p className="text-sand/70 text-sm mb-1">
            <a
              href="https://tonherd.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sand/70 hover:text-sand transition-colors"
            >
              Tonherd Music
            </a>
          </p>
          <a
            href="mailto:label@tonherd.at"
            className="text-sand/50 hover:text-sand transition-colors text-xs"
          >
            label@tonherd.at
          </a>
        </div>
      </ScrollReveal>

      {/* Press Kit PDF */}
      <a
        href="/press/onesheet.pdf"
        download
        className="inline-flex items-center gap-2 text-terracotta hover:text-sand transition-colors text-sm"
      >
        <Download className="w-4 h-4" />
        {t.press.download_onesheet}
      </a>
    </section>
  );
}
