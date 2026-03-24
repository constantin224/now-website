"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { SpotifyIcon, AppleMusicIcon, YoutubeIcon } from "./social-icons";

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
  listenLabel,
  children,
}: {
  release: Release;
  typeLabel: string;
  listenLabel: string;
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

  const links = [
    { name: "Spotify", url: `https://open.spotify.com/search/${query}`, icon: <SpotifyIcon size={18} /> },
    { name: "Apple Music", url: `https://music.apple.com/at/search?term=${query}`, icon: <AppleMusicIcon size={18} /> },
    { name: "Deezer", url: release.link, icon: <DeezerIcon size={18} /> },
    { name: "YouTube", url: `https://www.youtube.com/results?search_query=${query}`, icon: <YoutubeIcon size={18} /> },
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

      {/* Inline-Popover — über dem Cover */}
      {open && (
        <div
          ref={popupRef}
          className="absolute left-0 right-0 bottom-full mb-2 z-40 bg-[#161210] border border-sand/10 rounded-xl p-4 shadow-2xl shadow-black/50 animate-slide-up"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <p className="text-sand/80 text-sm font-medium truncate">{release.title}</p>
              <p className="text-sand/35 text-[10px]">
                Now. · {release.releaseDate.slice(0, 4)} · {typeLabel}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-sand/30 hover:text-sand/60 transition-colors cursor-pointer p-1 -mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Streaming-Links als kompakte Zeile */}
          <div className="grid grid-cols-4 gap-2">
            {links.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg bg-sand/5 hover:bg-sand/10 active:bg-sand/15 transition-colors text-sand/50 hover:text-sand"
              >
                <span className="text-terracotta">{link.icon}</span>
                <span className="text-[9px] tracking-wide">{link.name.split(" ")[0]}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
