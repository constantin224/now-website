import type { Metadata } from "next";
import Image from "next/image";
import { releases, videos } from "@/data/releases";
import YouTubeFacade from "@/components/youtube-facade";
import SpotifyEmbed from "@/components/spotify-embed";

export const metadata: Metadata = {
  title: "Music",
};

export default function MusicPage() {
  const album = releases[0];

  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Section Label */}
        <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
          Music
        </p>

        {/* Release Card */}
        <div className="flex flex-col sm:flex-row gap-8 mb-16">
          {/* Cover */}
          <div className="shrink-0">
            <Image
              src={album.cover}
              alt={`${album.title} — Cover`}
              width={200}
              height={200}
              className="rounded-lg"
            />
          </div>

          {/* Info */}
          <div className="flex flex-col justify-center gap-4">
            <div>
              <h2 className="font-heading text-3xl text-sand/90 mb-1">
                {album.title}
              </h2>
              <p className="text-sand/50 text-sm">
                {album.year} · {album.label}
              </p>
            </div>

            {/* Streaming Links */}
            <div className="flex flex-wrap gap-3">
              {album.links.spotify && (
                <a
                  href={album.links.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] tracking-[2px] uppercase px-4 py-2 rounded-full hover:bg-terracotta/20 transition-colors"
                >
                  Spotify
                </a>
              )}
              {album.links.apple && (
                <a
                  href={album.links.apple}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] tracking-[2px] uppercase px-4 py-2 rounded-full hover:bg-terracotta/20 transition-colors"
                >
                  Apple Music
                </a>
              )}
              {album.links.youtube && (
                <a
                  href={album.links.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] tracking-[2px] uppercase px-4 py-2 rounded-full hover:bg-terracotta/20 transition-colors"
                >
                  YouTube
                </a>
              )}
              {album.links.shop && (
                <a
                  href={album.links.shop}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] tracking-[2px] uppercase px-4 py-2 rounded-full hover:bg-terracotta/20 transition-colors"
                >
                  Shop
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Spotify Embed */}
        {album.spotifyEmbedId && (
          <div className="mb-16">
            <SpotifyEmbed artistId={album.spotifyEmbedId} />
          </div>
        )}

        {/* Video Grid */}
        {videos.length > 0 && (
          <div>
            <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
              Videos
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {videos.map((video) => (
                <YouTubeFacade
                  key={video.youtubeId}
                  videoId={video.youtubeId}
                  title={video.title}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
