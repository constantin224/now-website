import type { Metadata } from "next";
import Image from "next/image";
import { videos } from "@/data/releases";
import YouTubeFacade from "@/components/youtube-facade";
import SpotifyEmbed from "@/components/spotify-embed";
import { getMessages, type Locale } from "@/lib/i18n";
import { getAllReleases } from "@/lib/deezer";
import { ScrollReveal } from "@/components/scroll-reveal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  return {
    title: t.music.title,
  };
}

// Release-Typ-Label übersetzen
function typeLabel(type: string, locale: string): string {
  const labels: Record<string, Record<string, string>> = {
    single: { de: "Single", en: "Single" },
    album: { de: "Album", en: "Album" },
    ep: { de: "EP", en: "EP" },
  };
  return labels[type]?.[locale] || type;
}

export default async function MusicPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  // Alle Releases von Deezer holen
  const allReleases = await getAllReleases();
  const featured = allReleases[0];
  const discography = allReleases.slice(1);

  return (
    <section className="pt-28 md:pt-36 pb-[var(--spacing-section)] px-6">
      <div className="max-w-5xl mx-auto">
        {/* Section Label */}
        <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-16">
          {t.music.title}
        </p>

        {/* Featured / Neuestes Release */}
        {featured && (
          <ScrollReveal className="mb-[var(--spacing-block)]">
            <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
              {t.music.latest_release}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-center">
              {/* Cover — groß & prominent */}
              <a
                href="https://hypeddit.com/now-music"
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square max-w-md mx-auto md:mx-0 w-full rounded-lg overflow-hidden shadow-2xl shadow-black/40 group"
              >
                <Image
                  src={featured.cover}
                  alt={`${featured.title} — Cover`}
                  fill
                  sizes="(max-width: 768px) 90vw, 400px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  priority
                  unoptimized
                />
              </a>

              {/* Info */}
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-terracotta text-[9px] uppercase tracking-[3px] mb-2">
                    {typeLabel(featured.type, locale)}
                  </p>
                  <h2 className="font-heading text-[length:var(--text-h1)] tracking-[var(--tracking-heading)] leading-[var(--leading-heading)] text-sand/90 mb-2">
                    {featured.title}
                  </h2>
                  <p className="text-sand/45 text-sm tracking-wide">
                    {featured.releaseDate.slice(0, 4)} · Tonherd Music
                  </p>
                </div>

                {/* Streaming Link */}
                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://hypeddit.com/now-music"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] tracking-[2px] uppercase px-5 py-2.5 rounded-full hover:bg-terracotta/20 transition-colors"
                  >
                    {t.music.listen_on}
                  </a>
                </div>
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* Spotify Embed */}
        <ScrollReveal className="mb-[var(--spacing-block)]">
          <SpotifyEmbed artistId="46Z2az8XmrXnhr0ej2sr3Q" locale={locale as Locale} />
        </ScrollReveal>

        {/* Discography — alle weiteren Releases */}
        {discography.length > 0 && (
          <ScrollReveal className="mb-[var(--spacing-block)]">
            <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-10">
              {t.music.discography}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 md:gap-6">
              {discography.map((release) => (
                <a
                  key={release.id}
                  href="https://hypeddit.com/now-music"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  {/* Cover */}
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-3 shadow-lg shadow-black/30">
                    <Image
                      src={release.cover}
                      alt={`${release.title} — Cover`}
                      fill
                      sizes="(max-width: 640px) 45vw, (max-width: 768px) 30vw, 220px"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      unoptimized
                    />
                    {/* Hover-Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] uppercase tracking-[2px] bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">
                        {t.music.listen_on}
                      </span>
                    </div>
                  </div>
                  {/* Info */}
                  <h3 className="text-sand/80 text-sm font-medium truncate group-hover:text-sand transition-colors">
                    {release.title}
                  </h3>
                  <p className="text-sand/38 text-[10px] tracking-wide mt-0.5">
                    {release.releaseDate.slice(0, 4)} · {typeLabel(release.type, locale)}
                  </p>
                </a>
              ))}
            </div>
          </ScrollReveal>
        )}

        {/* Video Grid */}
        {videos.length > 0 && (
          <ScrollReveal>
            <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
              {t.music.videos_label}
            </p>
            {/* Featured Videos — die ersten 2 groß */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {videos.slice(0, 2).map((video) => (
                <YouTubeFacade
                  key={video.youtubeId}
                  videoId={video.youtubeId}
                  title={video.title}
                />
              ))}
            </div>
            {/* Weitere Videos — kompakter im 3er-Grid */}
            {videos.length > 2 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {videos.slice(2).map((video) => (
                  <YouTubeFacade
                    key={video.youtubeId}
                    videoId={video.youtubeId}
                    title={video.title}
                  />
                ))}
              </div>
            )}
          </ScrollReveal>
        )}
      </div>
    </section>
  );
}
