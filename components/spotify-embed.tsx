"use client";

import { useState } from "react";
import { SpotifyIcon } from "@/components/social-icons";
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
      className="w-full h-20 rounded-xl bg-bg-section border border-line hover:border-terracotta/30 transition-colors flex items-center justify-center gap-3 group cursor-pointer"
    >
      <SpotifyIcon size={22} className="text-[#1DB954] opacity-70 group-hover:opacity-100 transition-opacity" />
      <span className="text-sand/50 group-hover:text-sand/70 tracking-[2px] uppercase text-[10px] transition-colors">
        {t.music.listen_spotify}
      </span>
    </button>
  );
}
