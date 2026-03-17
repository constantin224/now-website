"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { LatestRelease } from "@/lib/deezer";

const STORAGE_KEY = "now-release-popup-dismissed";

type Props = {
  release: LatestRelease;
  locale: string;
};

export default function NewReleasePopup({ release, locale }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Nur einmal pro Session zeigen, und nur wenn sich der Release geändert hat
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (dismissed === release.title) return;

    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [release.title]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, release.title);
  };

  if (!visible) return null;

  const typeLabel =
    release.type === "single"
      ? locale === "de"
        ? "Neue Single"
        : "New Single"
      : release.type === "ep"
        ? locale === "de"
          ? "Neue EP"
          : "New EP"
        : locale === "de"
          ? "Neues Album"
          : "New Album";

  const outNowText =
    locale === "de"
      ? "Ab sofort überall verfügbar"
      : "Available now on all platforms";

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
              src={release.cover}
              alt={release.title}
              fill
              className="object-cover"
              unoptimized
            />
          </div>

          {/* Info */}
          <div className="flex flex-col justify-center min-w-0 pr-6">
            <span className="text-terracotta text-[9px] uppercase tracking-[3px] mb-1">
              {typeLabel}
            </span>
            <h3 className="text-sand text-sm font-medium tracking-wide truncate">
              {release.title}
            </h3>
            <p className="text-sand-38 text-[10px] mt-1">{outNowText}</p>
          </div>
        </div>

        {/* Streaming-Links */}
        <div className="flex border-t border-line">
          <a
            href={release.links.spotify}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="flex-1 text-center py-2.5 text-[9px] uppercase tracking-[2px] text-terracotta hover:bg-terracotta/10 transition-colors border-r border-line"
          >
            Spotify
          </a>
          <a
            href={release.links.apple}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="flex-1 text-center py-2.5 text-[9px] uppercase tracking-[2px] text-terracotta hover:bg-terracotta/10 transition-colors border-r border-line"
          >
            Apple
          </a>
          <a
            href={release.links.deezer}
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
