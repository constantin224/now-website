"use client";

import { useState } from "react";
import Image from "next/image";

type YouTubeFacadeProps = {
  videoId: string;
  title: string;
};

export default function YouTubeFacade({ videoId, title }: YouTubeFacadeProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="aspect-video rounded-lg overflow-hidden bg-bg-section">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="relative aspect-video rounded-lg overflow-hidden bg-bg-section group w-full"
      aria-label={`${title} abspielen`}
    >
      {/* Thumbnail */}
      <Image
        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
        alt={title}
        fill
        className="object-cover"
        unoptimized
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />

      {/* Play Button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full border-2 border-white/80 flex items-center justify-center group-hover:border-terracotta group-hover:bg-terracotta/10 transition-all">
          {/* Dreieck (Play-Symbol) */}
          <div
            className="w-0 h-0 ml-1 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[16px] border-l-white/90"
          />
        </div>
      </div>

      {/* Titel */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
        <p className="text-sand/80 text-sm">{title}</p>
      </div>
    </button>
  );
}
