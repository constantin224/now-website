import type { Metadata } from "next";
import Image from "next/image";
import { Download } from "lucide-react";
import { getMessages, type Locale } from "@/lib/i18n";

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
    <section className="pt-32 pb-20 px-6 max-w-5xl mx-auto">
      {/* Section Label */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-16">
        {t.press.title}
      </p>

      {/* Pressefotos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
      </div>

      {/* Download-Link — nur anzeigen wenn Datei existiert */}
      {/* TODO: /press/photos.zip erstellen, dann diesen Block aktivieren
      <a
        href="/press/photos.zip"
        className="inline-flex items-center gap-2 text-terracotta hover:text-sand transition-colors text-sm mb-16"
      >
        <Download className="w-4 h-4" />
        {t.press.download_all}
      </a>
      */}

      {/* Pressetext */}
      <div className="border-l-2 border-terracotta/30 pl-6 mb-20 mt-12">
        <p className="text-sand/70 text-lg leading-relaxed">
          {t.press.press_bio}
        </p>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-16">
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-2">
            {t.press.booking}
          </p>
          <a
            href="mailto:booking@now-music.at"
            className="text-sand/70 hover:text-sand transition-colors text-sm"
          >
            booking@now-music.at
          </a>
        </div>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-2">
            {t.press.management}
          </p>
          <p className="text-sand/70 text-sm">Tonherd OG, Wien</p>
        </div>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-2">
            {t.press.label}
          </p>
          <a
            href="https://tonherd.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sand/70 hover:text-sand transition-colors text-sm"
          >
            Tonherd Music
          </a>
        </div>
      </div>

      {/* One-Sheet — auskommentiert bis PDF existiert
      <a
        href="/press/onesheet.pdf"
        className="inline-flex items-center gap-2 text-terracotta hover:text-sand transition-colors text-sm"
      >
        <Download className="w-4 h-4" />
        {t.press.download_onesheet}
      </a>
      */}
    </section>
  );
}
