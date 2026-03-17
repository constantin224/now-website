import type { Metadata } from "next";
import { siteConfig } from "@/data/site";

export const metadata: Metadata = {
  title: "Impressum",
  robots: { index: false },
};

export default function ImpressumPage() {
  return (
    <section className="max-w-2xl mx-auto px-6 py-20 pt-32">
      {/* Impressum */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
        Impressum
      </p>

      <p className="text-sand-50 text-sm mb-6">
        Informationspflicht laut §5 E-Commerce Gesetz (ECG)
      </p>

      <div className="text-sand-50 text-sm space-y-1 mb-6">
        <p>{siteConfig.impressum.firma}</p>
        <p>{siteConfig.impressum.adresse}</p>
        <p className="text-sand-38">[Adresse wird ergänzt]</p>
      </div>

      <div className="text-sand-50 text-sm space-y-1 mb-6">
        <p>Kontakt: {siteConfig.impressum.kontakt}</p>
        <p>UID: <span className="text-sand-38">[wird ergänzt]</span></p>
      </div>

      <p className="text-sand-50 text-sm mb-16">
        Unternehmensgegenstand: Tonstudio und Musiklabel
      </p>

      {/* Datenschutz */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
        Datenschutz
      </p>

      <div className="text-sand-50 text-sm space-y-4">
        <p>
          Diese Website verwendet keine Cookies und sammelt keine
          personenbezogenen Daten.
        </p>
        <p>
          Externe Inhalte (YouTube, Spotify) werden erst nach Interaktion
          geladen.
        </p>
      </div>
    </section>
  );
}
