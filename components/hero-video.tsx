"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Volume2, VolumeX } from "lucide-react";
import { getMessages, type Locale } from "@/lib/i18n";

export function HeroVideo({ locale }: { locale: Locale }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revealHero, setRevealHero] = useState(false);
  const t = getMessages(locale);

  // Ladescreen beenden
  const dismissLoader = useCallback(() => {
    if (!loading) return;
    setLoading(false);
    // Kurze Verzögerung damit der Fade-Out des Loaders fertig ist
    setTimeout(() => setRevealHero(true), 100);
  }, [loading]);

  // Reduced Motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Video-Ready oder Timeout → Loader schließen
  useEffect(() => {
    // Timeout-Fallback: Nach 4.5s Loader schließen, egal was
    const timeout = setTimeout(dismissLoader, 4500);

    // Wenn Video spielbereit ist, Loader sofort schließen (min. 1.5s warten für den Effekt)
    const minDelay = setTimeout(() => {
      const desktop = videoRef.current;
      const mobile = mobileVideoRef.current;

      const checkReady = () => {
        if (
          (desktop && desktop.readyState >= 3) ||
          (mobile && mobile.readyState >= 3)
        ) {
          dismissLoader();
        }
      };

      // Sofort prüfen
      checkReady();

      // Auf Events lauschen
      desktop?.addEventListener("canplay", checkReady);
      mobile?.addEventListener("canplay", checkReady);

      return () => {
        desktop?.removeEventListener("canplay", checkReady);
        mobile?.removeEventListener("canplay", checkReady);
      };
    }, 1500);

    return () => {
      clearTimeout(timeout);
      clearTimeout(minDelay);
    };
  }, [dismissLoader]);

  // Reduced Motion → kein Loader nötig
  useEffect(() => {
    if (prefersReducedMotion) {
      setLoading(false);
      setRevealHero(true);
    }
  }, [prefersReducedMotion]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  return (
    <>
      {/* === LADESCREEN === */}
      <div
        className={`fixed inset-0 z-[100] bg-bg-base flex flex-col items-center justify-center transition-opacity duration-700 ${
          loading ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Logo — faded ein */}
        <div className="animate-loader-logo">
          <Image
            src="/logo.png"
            alt="Now."
            width={120}
            height={48}
            style={{ filter: "invert(1) brightness(0.8)" }}
            priority
          />
        </div>

        {/* Terracotta Linie — wächst von links nach rechts */}
        <div className="mt-8 w-40 h-px bg-line overflow-hidden">
          <div className="h-full bg-terracotta/60 animate-loader-line" />
        </div>
      </div>

      {/* === HERO === */}
      <section className="h-svh w-full relative overflow-hidden">
        {/* Video Desktop */}
        {!prefersReducedMotion && (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            loop
            poster="/video-poster.jpg"
            className={`object-cover absolute inset-0 w-full h-full hidden md:block transition-opacity duration-1000 ${
              revealHero ? "opacity-100" : "opacity-0"
            }`}
          >
            <source src="/video.webm" type="video/webm" />
            <source src="/video.mp4" type="video/mp4" />
          </video>
        )}

        {/* Video Mobile */}
        {!prefersReducedMotion && (
          <video
            ref={mobileVideoRef}
            playsInline
            autoPlay
            muted
            loop
            poster="/video-poster.jpg"
            className={`object-cover absolute inset-0 w-full h-full block md:hidden transition-opacity duration-1000 ${
              revealHero ? "opacity-100" : "opacity-0"
            }`}
          >
            <source src="/video-mobile.mp4" type="video/mp4" />
          </video>
        )}

        {/* Reduced-Motion-Fallback */}
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

        {/* Content-Layer — faded nach Loader ein */}
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center transition-all duration-1000 delay-200 ${
            revealHero
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-3"
          }`}
        >
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
        <div
          className={`absolute bottom-6 left-6 right-6 z-10 flex items-end justify-between transition-opacity duration-1000 delay-500 ${
            revealHero ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="text-sand-38 text-[9px] tracking-[2px]">
            {t.hero.video_label}
          </span>

          <div className="flex flex-col items-center">
            <div className="w-px h-[30px] bg-sand-38 animate-pulse" />
          </div>

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
    </>
  );
}
