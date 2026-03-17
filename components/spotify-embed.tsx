"use client";

import { useState } from "react";
import { getMessages, type Locale } from "@/lib/i18n";

type SpotifyEmbedProps = {
  artistId: string;
  locale: Locale;
};

export default function SpotifyEmbed({ artistId, locale }: SpotifyEmbedProps) {
  const [loaded, setLoaded] = useState(false);
  const t = getMessages(locale);

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
        {t.music.listen_spotify}
      </span>
    </button>
  );
}
