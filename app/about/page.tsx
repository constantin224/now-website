import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Über Now. — Pop-Rock-Band aus Wien",
};

export default function AboutPage() {
  return (
    <section className="pt-32 pb-20 px-6">
      {/* Section Label */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
        About
      </p>

      {/* Bandfoto Platzhalter */}
      <div className="bg-bg-section h-[40vh] flex items-center justify-center rounded-lg max-w-4xl mx-auto">
        <span className="text-sand/20 tracking-[6px] uppercase text-sm">
          Bandfoto
        </span>
      </div>

      {/* Bio */}
      <div className="max-w-2xl mx-auto px-6 py-20">
        <p className="text-sand/70 leading-relaxed mb-6">
          Now. sind vier Musiker aus Wien, die seit 2019 gemeinsam erdigen
          Pop-Rock machen. Was als lockere Jam-Sessions begann, wurde schnell
          zur Band mit eigenem Sound — irgendwo zwischen Alternative Rock und
          Indie Pop, immer mit Bodenhaftung.
        </p>
        <p className="text-sand/70 leading-relaxed mb-6">
          Mit ihrem Debütalbum „Out" (2024, Tonherd Music) haben Now. ihren Weg
          auf Platte gebracht: ehrliche Songs über das Leben, die Liebe und
          alles dazwischen. Live sind Now. in ihrem Element — energiegeladen,
          direkt und nah am Publikum.
        </p>
        <p className="text-sand/50 leading-relaxed">
          Die Band: [Mitglieder werden ergänzt]
        </p>
      </div>

      {/* JSON-LD MusicGroup Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MusicGroup",
            name: "Now.",
            genre: "Pop Rock",
            foundingLocation: { "@type": "City", name: "Wien" },
            url: "https://now-music.at",
            sameAs: [
              "https://www.instagram.com/now.itsofficial",
              "https://www.facebook.com/profile.php?id=100076664337992",
              "https://open.spotify.com/intl-de/artist/46Z2az8XmrXnhr0ej2sr3Q",
            ],
          }),
        }}
      />
    </section>
  );
}
