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
    <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      {/* Section Label */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
        {t.press.title}
      </p>

      {/* Pressefotos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <a
          href="/band-photo.jpg"
          download
          className="relative h-64 rounded-lg overflow-hidden group"
        >
          <Image
            src="/band-photo.jpg"
            alt="Now. — Bandfoto"
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Download className="w-8 h-8 text-white" />
          </div>
        </a>
        {/* Weiteres Pressefoto — Platzhalter */}
        <div className="bg-bg-section h-64 rounded-lg flex flex-col items-center justify-center gap-3">
          <span className="text-sand/20 tracking-[6px] uppercase text-sm">
            {t.press.photo_label}
          </span>
          <Download className="w-5 h-5 text-sand/20" />
        </div>
      </div>

      {/* ZIP Download */}
      <a
        href="/press/photos.zip"
        className="inline-flex items-center gap-2 text-terracotta hover:text-sand transition-colors text-sm mb-16"
      >
        <Download className="w-4 h-4" />
        {t.press.download_all}
      </a>

      {/* Kontakt */}
      <div className="mb-16 space-y-4">
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-1">
            {t.press.booking}
          </p>
          <a
            href="mailto:booking@now-music.at"
            className="text-sand/70 hover:text-sand transition-colors"
          >
            booking@now-music.at
          </a>
        </div>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-1">
            {t.press.management}
          </p>
          <p className="text-sand/70">Tonherd OG, Wien</p>
        </div>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-1">
            {t.press.label}
          </p>
          <a
            href="https://tonherd.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sand/70 hover:text-sand transition-colors"
          >
            Tonherd Music
          </a>
        </div>
      </div>

      {/* One-Sheet Download */}
      <a
        href="/press/onesheet.pdf"
        className="inline-flex items-center gap-2 text-terracotta hover:text-sand transition-colors text-sm mb-16"
      >
        <Download className="w-4 h-4" />
        {t.press.download_onesheet}
      </a>

      {/* Pressetext */}
      <div className="border-l-2 border-terracotta/30 pl-6">
        <p className="text-sand/70 leading-relaxed">
          {t.press.press_bio}
        </p>
      </div>
    </section>
  );
}
