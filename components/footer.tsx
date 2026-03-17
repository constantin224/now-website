import Link from "next/link";
import { socialLinks } from "@/data/social";
import { SpotifyIcon, InstagramIcon, FacebookIcon, YoutubeIcon, AppleMusicIcon } from "@/components/social-icons";

// Icon-Mapping: social.ts icon-String → Brand-SVG-Komponente
const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  music: SpotifyIcon,
  youtube: YoutubeIcon,
  apple: AppleMusicIcon,
};

export default function Footer() {
  return (
    <footer className="bg-bg-section border-t border-line">
      <div className="mx-auto max-w-7xl px-6 py-16 flex flex-col items-center gap-8">
        {/* Social Icons */}
        <div className="flex items-center gap-6">
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
                <Icon size={20} />
              </a>
            );
          })}
        </div>

        {/* Label Branding */}
        <p className="text-sand-38 text-xs tracking-wide">
          Released via{" "}
          <a
            href="https://tonherd.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-terracotta transition-colors"
          >
            Tonherd Music
          </a>
        </p>

        {/* Copyright & Impressum */}
        <div className="flex flex-col items-center gap-2 text-sand-38 text-[11px] tracking-wide">
          <p>&copy; 2026 Now. &middot; Tonherd Music &middot; Wien</p>
          <Link
            href="/impressum"
            className="hover:text-terracotta transition-colors"
          >
            Impressum
          </Link>
        </div>
      </div>
    </footer>
  );
}
