"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Volume2, VolumeX } from "lucide-react";
import { getMessages, type Locale } from "@/lib/i18n";

export function HeroVideo({ locale }: { locale: Locale }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const t = getMessages(locale);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  return (
    <section className="h-svh w-full relative overflow-hidden">
      {/* Video Desktop — nur ohne reduced-motion */}
      {!prefersReducedMotion && (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          loop
          poster="/video-poster.jpg"
          className="object-cover absolute inset-0 w-full h-full hidden md:block"
        >
          <source src="/video.webm" type="video/webm" />
          <source src="/video.mp4" type="video/mp4" />
        </video>
      )}

      {/* Video Mobile — komprimierte Version */}
      {!prefersReducedMotion && (
        <video
          playsInline
          autoPlay
          muted
          loop
          poster="/video-poster.jpg"
          className="object-cover absolute inset-0 w-full h-full block md:hidden"
        >
          <source src="/video-mobile.mp4" type="video/mp4" />
        </video>
      )}

      {/* Reduced-Motion-Fallback: Poster-Bild */}
      {prefersReducedMotion && (
        <Image
          src="/album-cover-out.jpg"
          alt="Now. Band"
          fill
          priority
          className="object-cover"
        />
      )}

      {/* Dunkles Overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Content-Layer */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
        {/* Bandlogo */}
        <Image
          src="/logo.png"
          alt="Now."
          width={250}
          height={100}
          className="brightness-[0.9]"
          style={{ filter: "invert(1) brightness(0.9)" }}
        />

        {/* Subtitle */}
        <p className="mt-4 text-[10px] uppercase tracking-[3px] text-sand-38">
          {t.hero.tagline}
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex gap-4">
          <Link
            href={`/${locale}/music`}
            className="border border-terracotta/30 bg-terracotta/15 text-terracotta px-7 py-3 text-[10px] tracking-[3px] uppercase hover:bg-terracotta/25 transition"
          >
            {t.hero.cta_album}
          </Link>
          <Link
            href={`/${locale}/shows`}
            className="border border-sand/10 text-sand-38 px-7 py-3 text-[10px] tracking-[3px] uppercase hover:text-sand transition"
          >
            {t.hero.cta_shows}
          </Link>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="absolute bottom-6 left-6 right-6 z-10 flex items-end justify-between">
        {/* Links: Video-Label */}
        <span className="text-sand-38 text-[9px] tracking-[2px]">
          {t.hero.video_label}
        </span>

        {/* Mitte: Scroll-Indikator */}
        <div className="flex flex-col items-center">
          <div className="w-px h-[30px] bg-sand-38 animate-pulse" />
        </div>

        {/* Rechts: Unmute-Button */}
        <button
          onClick={toggleMute}
          className="flex items-center gap-2 text-sand-38 text-[9px] tracking-[2px] border border-sand/10 px-3 py-1.5 rounded cursor-pointer"
        >
          {isMuted ? (
            <VolumeX className="w-3 h-3" />
          ) : (
            <Volume2 className="w-3 h-3" />
          )}
          {isMuted ? t.hero.unmute : t.hero.mute}
        </button>
      </div>
    </section>
  );
}
