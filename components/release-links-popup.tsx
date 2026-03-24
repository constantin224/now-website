"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { SpotifyIcon, AppleMusicIcon, YoutubeIcon } from "./social-icons";

// Deezer SVG inline (kein Import nötig)
function DeezerIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.5 0v4.1h-3V0h3zm0 5.5v4.1h-3V5.5h3zm0 5.5v4.1h-3V11h3zm0 5.5v4.1h-3v-4.1h3zM8 11v4.1H5V11h3zm0 5.5v4.1H5v-4.1h3zM4.5 16.5v4.1h-3v-4.1h3zm10.5-11v4.1h-3V5.5h3zm0 5.5v4.1h-3V11h3zm0 5.5v4.1h-3v-4.1h3zm3.5-5.5v4.1h-3V11h3zm0 5.5v4.1h-3v-4.1h3zm3.5 0v4.1h-3v-4.1h3z"/>
    </svg>
  );
}

type Release = {
  id: number;
  title: string;
  type: string;
  releaseDate: string;
  cover: string;
  link: string; // Deezer-Link
};

export default function ReleaseLinkPopup({
  release,
  typeLabel,
  listenLabel,
  children,
}: {
  release: Release;
  typeLabel: string;
  listenLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Schließen bei Klick außerhalb
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    // Escape-Taste
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Such-Query für Plattformen
  const query = encodeURIComponent(`Now. ${release.title}`);

  const links = [
    {
      name: "Spotify",
      url: `https://open.spotify.com/search/${query}`,
      icon: <SpotifyIcon size={18} />,
    },
    {
      name: "Apple Music",
      url: `https://music.apple.com/at/search?term=${query}`,
      icon: <AppleMusicIcon size={18} />,
    },
    {
      name: "Deezer",
      url: release.link,
      icon: <DeezerIcon size={18} />,
    },
    {
      name: "YouTube",
      url: `https://www.youtube.com/results?search_query=${query}`,
      icon: <YoutubeIcon size={18} />,
    },
  ];

  return (
    <div className="relative">
      {/* Cover als klickbares Element */}
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left cursor-pointer group"
      >
        {children}
      </button>

      {/* Popup-Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4">
          <div
            ref={popupRef}
            className="bg-[#161210] border border-sand/10 rounded-t-xl sm:rounded-xl max-w-sm w-full p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl"
          >
            {/* Header mit Cover */}
            <div className="flex items-start gap-4 mb-5">
              <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 shadow-lg">
                <Image
                  src={release.cover}
                  alt={release.title}
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sand/90 text-sm font-medium truncate">
                  {release.title}
                </h3>
                <p className="text-sand/40 text-xs mt-0.5">
                  Now. · {release.releaseDate.slice(0, 4)} · {typeLabel}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-sand/30 hover:text-sand/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Streaming-Links */}
            <p className="text-terracotta uppercase tracking-[3px] text-[9px] mb-3">
              {listenLabel}
            </p>
            <div className="space-y-2">
              {links.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3.5 rounded-lg bg-sand/5 hover:bg-sand/10 active:bg-sand/15 transition-colors text-sand/70 hover:text-sand text-sm"
                >
                  <span className="text-terracotta">{link.icon}</span>
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
