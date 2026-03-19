import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getMessages, type Locale } from "@/lib/i18n";
import { socialLinks } from "@/data/social";
import { SpotifyIcon, InstagramIcon, FacebookIcon, YoutubeIcon, AppleMusicIcon } from "@/components/social-icons";
import { ScrollReveal } from "@/components/scroll-reveal";

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  music: SpotifyIcon,
  youtube: YoutubeIcon,
  apple: AppleMusicIcon,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  return {
    title: t.about.title,
    description: t.about.description,
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  return (
    <section className="pt-[var(--spacing-section-lg)] pb-[var(--spacing-section)] px-6">
      {/* Section Label -- kein ScrollReveal, sofort sichtbar */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-16">
        {t.about.title}
      </p>

      {/* Hero-Bild — Full-Bleed mit Gradient (STRUC-02) */}
      <ScrollReveal className="full-bleed mb-[var(--spacing-block)]">
        <div className="relative h-[50vh] md:h-[70vh] overflow-hidden">
          <Image
            src="/band-photo-3.jpg"
            alt="Now. — Bandfoto"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/20 to-transparent" />
        </div>
      </ScrollReveal>

      {/* Bio — zentriert, gut lesbar */}
      <ScrollReveal className="max-w-2xl mx-auto mb-[var(--spacing-block)]" y={40} duration={1}>
        <p className="text-sand/70 text-lg leading-relaxed mb-8">
          {t.about.bio_1}
        </p>
        <p className="text-sand/70 text-lg leading-relaxed mb-8">
          {t.about.bio_2}
        </p>
        <p className="text-sand/70 text-lg leading-relaxed mb-8">
          {t.about.bio_3}
        </p>
        <p className="text-sand/70 text-lg leading-relaxed mb-8">
          {t.about.bio_4}
        </p>
        <p className="text-sand/70 text-lg leading-relaxed mb-10">
          {t.about.bio_5}
        </p>
      </ScrollReveal>

      {/* Bandmitglieder */}
      <ScrollReveal className="max-w-2xl mx-auto mb-[var(--spacing-block)]" delay={0.2}>
        <div className="w-12 h-px bg-terracotta/30 mx-auto mb-10" />
        <div className="text-center space-y-1">
          {t.about.bio_members.split("\n").map((member: string) => (
            <p key={member} className="text-sand/45 leading-relaxed tracking-wide">
              {member}
            </p>
          ))}
        </div>
      </ScrollReveal>

      {/* Social Links + CTA */}
      <ScrollReveal className="max-w-2xl mx-auto text-center" delay={0.1}>
        {/* Social Icons */}
        <div className="flex items-center justify-center gap-6 mb-8">
          {socialLinks.map((link) => {
            const Icon = iconMap[link.icon];
            if (!Icon) return null;
            return (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.name}
                className="text-sand-38 hover:text-terracotta transition-colors"
              >
                <Icon size={22} />
              </a>
            );
          })}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href={`/${locale}/music`}
            className="border border-terracotta/30 bg-terracotta/10 text-terracotta px-6 py-2.5 text-[10px] tracking-[3px] uppercase hover:bg-terracotta/20 transition-colors rounded-full"
          >
            {t.hero.cta_album}
          </Link>
          <Link
            href={`/${locale}/press`}
            className="border border-sand/10 text-sand/50 px-6 py-2.5 text-[10px] tracking-[3px] uppercase hover:text-sand hover:border-sand/20 transition-colors rounded-full"
          >
            Press / EPK
          </Link>
        </div>
      </ScrollReveal>

      {/* JSON-LD MusicGroup Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MusicGroup",
            name: "Now.",
            genre: "Pop Rock",
            foundingLocation: { "@type": "City", name: "Wien" },
            url: "https://now-music.at",
            sameAs: [
              "https://www.instagram.com/now.itsofficial",
              "https://www.facebook.com/profile.php?id=100076664337992",
              "https://open.spotify.com/intl-de/artist/46Z2az8XmrXnhr0ej2sr3Q",
            ],
          }),
        }}
      />
    </section>
  );
}
