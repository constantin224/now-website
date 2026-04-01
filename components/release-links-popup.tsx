"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { SpotifyIcon, AppleMusicIcon, YoutubeIcon } from "./social-icons";
import { releaseLinks } from "@/data/release-links";

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
  link: string;
};

export default function ReleaseLinkPopup({
  release,
  typeLabel,
  children,
}: {
  release: Release;
  typeLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Schließen bei Klick außerhalb oder Escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Timeout damit der öffnende Klick nicht sofort schließt
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("touchstart", handleClick as unknown as EventListener);
    }, 10);
    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick as unknown as EventListener);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Popup ins Sichtfeld scrollen
  useEffect(() => {
    if (open && popupRef.current) {
      popupRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [open]);

  const query = encodeURIComponent(`Now. ${release.title}`);
  const manual = releaseLinks[release.id];

  const links = [
    { name: "Spotify", url: manual?.spotify || `https://open.spotify.com/search/${query}`, icon: <SpotifyIcon size={18} /> },
    { name: "Apple Music", url: manual?.apple || `https://music.apple.com/at/search?term=${query}`, icon: <AppleMusicIcon size={18} /> },
    { name: "Deezer", url: release.link, icon: <DeezerIcon size={18} /> },
    { name: "YouTube", url: manual?.youtube || `https://www.youtube.com/results?search_query=${query}`, icon: <YoutubeIcon size={18} /> },
  ];

  return (
    <div ref={containerRef} className="relative">
      {/* Cover als klickbares Element */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left cursor-pointer group"
      >
        {children}
      </button>

      {/* Overlay — Cover bleibt sichtbar, Links darüber */}
      <div
        ref={popupRef}
        className={`absolute inset-0 z-40 rounded-lg overflow-hidden flex flex-col justify-end transition-all duration-300 ease-out ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Gradient-Overlay — Cover bleibt oben sichtbar */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e0c0a] via-[#0e0c0a]/90 to-[#0e0c0a]/40" />

        {/* Content — unten verankert */}
        <div className="relative z-10 p-4 md:p-5">
          {/* Titel + Close */}
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              <p className="text-sand text-sm font-medium truncate">{release.title}</p>
              <p className="text-sand/40 text-[11px] mt-0.5">
                Now. · {release.releaseDate.slice(0, 4)} · {typeLabel}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-sand/40 hover:text-sand transition-colors cursor-pointer p-1.5 -mr-1.5 -mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Streaming-Links */}
          <div className="grid grid-cols-4 gap-2.5">
            {links.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 py-3 rounded-lg bg-sand/[0.07] hover:bg-sand/[0.14] active:bg-sand/[0.18] border border-sand/[0.06] hover:border-sand/[0.12] transition-all duration-200 cursor-pointer group"
              >
                <span className="text-terracotta group-hover:text-terracotta/90 transition-colors">{link.icon}</span>
                <span className="text-[10px] text-sand/50 group-hover:text-sand/70 tracking-wider transition-colors">{link.name.split(" ")[0]}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
