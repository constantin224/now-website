"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { getMessages, type Locale } from "@/lib/i18n";

const SINGLE = {
  title: "Checkmate Time",
  releaseDate: "2026-03-13",
  cover: "https://cdn-images.dzcdn.net/images/cover/6a69f2be5ee31aee43bf588eb472f472/500x500-000000-80-0-0.jpg",
  links: {
    spotify: "https://open.spotify.com/intl-de/artist/46Z2az8XmrXnhr0ej2sr3Q",
    apple: "https://music.apple.com/at/artist/now/1603132645",
    deezer: "https://www.deezer.com/track/3865112001",
  },
};

const STORAGE_KEY = "now-release-popup-dismissed";

export default function NewReleasePopup({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const t = getMessages(locale);

  useEffect(() => {
    // Nur einmal pro Session zeigen
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    // Nach 3 Sekunden einblenden (nach dem Ladescreen)
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, "true");
  };

  if (!visible) return null;

  const newSingleText = locale === "de" ? "Neue Single" : "New Single";
  const listenNowText = locale === "de" ? "Jetzt anhören" : "Listen Now";
  const outNowText = locale === "de" ? "Ab sofort überall verfügbar" : "Available now on all platforms";

  return (
    <div className="fixed bottom-6 right-6 z-[90] animate-slide-up max-w-sm">
      <div className="bg-bg-section/95 backdrop-blur-md border border-line rounded-lg shadow-2xl shadow-black/50 overflow-hidden">
        {/* Schließen-Button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 z-10 text-sand-38 hover:text-sand transition-colors cursor-pointer"
          aria-label="Schließen"
        >
          <X size={16} />
        </button>

        <div className="flex gap-4 p-4">
          {/* Cover */}
          <div className="shrink-0 relative w-20 h-20 rounded overflow-hidden">
            <Image
              src={SINGLE.cover}
              alt={SINGLE.title}
              fill
              className="object-cover"
              unoptimized
            />
          </div>

          {/* Info */}
          <div className="flex flex-col justify-center min-w-0">
            <span className="text-terracotta text-[9px] uppercase tracking-[3px] mb-1">
              {newSingleText}
            </span>
            <h3 className="text-sand text-sm font-medium tracking-wide truncate">
              {SINGLE.title}
            </h3>
            <p className="text-sand-38 text-[10px] mt-1">
              {outNowText}
            </p>
          </div>
        </div>

        {/* Streaming-Links */}
        <div className="flex border-t border-line">
          <a
            href={SINGLE.links.spotify}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="flex-1 text-center py-2.5 text-[9px] uppercase tracking-[2px] text-terracotta hover:bg-terracotta/10 transition-colors border-r border-line"
          >
            Spotify
          </a>
          <a
            href={SINGLE.links.apple}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="flex-1 text-center py-2.5 text-[9px] uppercase tracking-[2px] text-terracotta hover:bg-terracotta/10 transition-colors border-r border-line"
          >
            Apple
          </a>
          <a
            href={SINGLE.links.deezer}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="flex-1 text-center py-2.5 text-[9px] uppercase tracking-[2px] text-terracotta hover:bg-terracotta/10 transition-colors"
          >
            Deezer
          </a>
        </div>
      </div>
    </div>
  );
}
