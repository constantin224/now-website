import type { Metadata } from "next";
import { Download } from "lucide-react";

export const metadata: Metadata = {
  title: "Press / EPK",
  description: "Electronic Press Kit — Now.",
};

export default function PressPage() {
  return (
    <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      {/* Section Label */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
        Press / EPK
      </p>

      {/* Pressefotos */}
      {/* Pressefotos werden hier ergänzt */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-bg-section h-48 rounded-lg flex flex-col items-center justify-center gap-3">
          <span className="text-sand/20 tracking-[6px] uppercase text-sm">
            Pressefoto
          </span>
          <Download className="w-5 h-5 text-sand/20" />
        </div>
        <div className="bg-bg-section h-48 rounded-lg flex flex-col items-center justify-center gap-3">
          <span className="text-sand/20 tracking-[6px] uppercase text-sm">
            Pressefoto
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
        Alle Pressefotos herunterladen (ZIP)
      </a>

      {/* Kontakt */}
      <div className="mb-16 space-y-4">
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-1">
            Booking
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
            Management
          </p>
          <p className="text-sand/70">Tonherd OG, Wien</p>
        </div>
        <div>
          <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-1">
            Label
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
        One-Sheet herunterladen (PDF)
      </a>

      {/* Pressetext */}
      <div className="border-l-2 border-terracotta/30 pl-6">
        <p className="text-sand/70 leading-relaxed">
          Now. sind eine Pop-Rock-Band aus Wien. Seit 2019 machen die vier
          Musiker erdige, ehrliche Songs — irgendwo zwischen Alternative Rock
          und Indie Pop. Ihr Debütalbum „Out" erschien 2024 auf Tonherd Music.
          Live sind Now. in ihrem Element: energiegeladen, direkt, nah am
          Publikum.
        </p>
      </div>
    </section>
  );
}
