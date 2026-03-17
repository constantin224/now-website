"use client";

import { useState } from "react";

type SpotifyEmbedProps = {
  artistId: string;
};

export default function SpotifyEmbed({ artistId }: SpotifyEmbedProps) {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <iframe
        src={`https://open.spotify.com/embed/artist/${artistId}?theme=0`}
        width="100%"
        height={352}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="rounded-xl"
      />
    );
  }

  return (
    <button
      onClick={() => setLoaded(true)}
      className="w-full h-[352px] rounded-xl bg-bg-section border border-terracotta/20 flex items-center justify-center gap-3 hover:border-terracotta/40 transition-colors"
    >
      <span className="text-terracotta tracking-[2px] uppercase text-[11px]">
        Auf Spotify anhören
      </span>
    </button>
  );
}
