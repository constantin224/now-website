import type { Metadata } from "next";
import Image from "next/image";
import { getMessages, type Locale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  return {
    title: t.about.title,
    description: t.about.description,
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  return (
    <section className="pt-32 pb-20 px-6">
      {/* Section Label */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
        {t.about.title}
      </p>

      {/* Bandfoto */}
      <div className="relative h-[40vh] md:h-[50vh] max-w-4xl mx-auto rounded-lg overflow-hidden">
        <Image
          src="/band-photo.jpg"
          alt="Now. — Bandfoto"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-base/80 to-transparent" />
      </div>

      {/* Bio */}
      <div className="max-w-2xl mx-auto px-6 py-20">
        <p className="text-sand/70 leading-relaxed mb-6">
          {t.about.bio_1}
        </p>
        <p className="text-sand/70 leading-relaxed mb-6">
          {t.about.bio_2}
        </p>
        <p className="text-sand/50 leading-relaxed">
          {t.about.bio_members}
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
