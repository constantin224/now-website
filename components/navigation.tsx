"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { getMessages, type Locale } from "@/lib/i18n";

export default function Navigation({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = getMessages(locale);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { label: t.nav.home, href: `/${locale}` },
    { label: t.nav.about, href: `/${locale}/about` },
    { label: t.nav.music, href: `/${locale}/music` },
    { label: t.nav.shows, href: `/${locale}/shows` },
    { label: t.nav.press, href: `/${locale}/press` },
  ];

  // Aktuellen Pfad ohne Locale-Prefix ermitteln
  const pathnameWithoutLocale = pathname.replace(/^\/(de|en)/, "") || "/";

  const isHome = pathname === `/${locale}` || pathname === `/${locale}/`;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    // Initialen Zustand setzen
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Body-Scroll sperren wenn Mobile-Menü offen
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Hintergrund: transparent auf Homepage wenn nicht gescrollt, sonst solid
  const showBg = !isHome || scrolled;

  // Sprachwechsler-Komponente
  const LanguageSwitcher = ({ className }: { className?: string }) => (
    <div className={`flex items-center gap-2 text-[10px] tracking-[2px] ${className || ""}`}>
      <Link
        href={`/de${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`}
        className={locale === "de" ? "text-terracotta" : "text-sand-38 hover:text-sand transition-colors"}
      >
        DE
      </Link>
      <span className="text-sand/20">|</span>
      <Link
        href={`/en${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`}
        className={locale === "en" ? "text-terracotta" : "text-sand-38 hover:text-sand transition-colors"}
      >
        EN
      </Link>
    </div>
  );

  return (
    <>
      <nav
        className={`fixed top-0 w-full z-50 transition-colors duration-300 ${
          showBg ? "bg-bg-base/90 backdrop-blur-sm" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex items-center justify-between px-6 py-4 max-w-7xl">
          {/* Logo */}
          <Link href={`/${locale}`}>
            <Image
              src="/logo.png"
              alt="Now. Logo"
              width={60}
              height={24}
              className="invert"
              priority
            />
          </Link>

          {/* Desktop-Links + Sprachwechsler */}
          <div className="hidden md:flex items-center">
            <ul className="flex items-center gap-8">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`uppercase tracking-[3px] text-[10px] transition-colors ${
                      pathname === link.href
                        ? "text-terracotta"
                        : "text-sand-38 hover:text-sand"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <LanguageSwitcher className="ml-6" />
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden text-sand-38 hover:text-sand transition-colors"
            onClick={() => setMenuOpen(true)}
            aria-label="Menü öffnen"
          >
            <Menu size={24} />
          </button>
        </div>
      </nav>

      {/* Mobile Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-bg-base/95 backdrop-blur-md flex flex-col items-center justify-center">
          <button
            className="absolute top-4 right-6 text-sand-38 hover:text-sand transition-colors"
            onClick={() => setMenuOpen(false)}
            aria-label="Menü schließen"
          >
            <X size={28} />
          </button>
          <ul className="flex flex-col items-center gap-8">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`uppercase tracking-[3px] text-sm transition-colors ${
                    pathname === link.href
                      ? "text-terracotta"
                      : "text-sand-38 hover:text-sand"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* Sprachwechsler im Mobile-Menü */}
          <LanguageSwitcher className="mt-8" />
        </div>
      )}
    </>
  );
}
