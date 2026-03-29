import { notFound } from "next/navigation";
import { isValidLocale, type Locale } from "@/lib/i18n";
import { fontVariables } from "@/app/layout";
import Navigation from "@/components/navigation";
import Footer from "@/components/footer";
import NewReleasePopup from "@/components/new-release-popup";
import { getLatestRelease } from "@/lib/deezer";
import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";

export function generateStaticParams() {
  return [{ locale: "de" }, { locale: "en" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const latestRelease = await getLatestRelease();

  // Globales MusicGroup JSON-LD — erscheint auf jeder Seite fuer Google Knowledge Panel
  const musicGroupJsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    "@id": "https://now-music.at/#band",
    "mainEntityOfPage": "https://www.wikidata.org/wiki/Q138828241",
    name: "Now.",
    alternateName: ["Now. Band", "Now. Band Wien"],
    url: "https://now-music.at",
    logo: "https://now-music.at/logo.png",
    image: "https://now-music.at/band-photo.jpg",
    description:
      locale === "de"
        ? "Pop-Rock-Band aus Wien — erdige Songs, ehrliche Texte, live auf der Bühne zuhause."
        : "Pop rock band from Vienna — earthy songs, honest lyrics, at home on stage.",
    genre: ["Pop Rock", "Pop", "Rock"],
    foundingDate: "2020",
    foundingLocation: {
      "@type": "City",
      name: "Wien",
      addressCountry: "AT",
      "@id": "https://www.wikidata.org/wiki/Q1741",
    },
    member: [
      {
        "@type": "OrganizationRole",
        member: { "@type": "Person", name: "Valentin Bröderbauer" },
        roleName: ["Vocals", "Guitar"],
      },
      {
        "@type": "OrganizationRole",
        member: { "@type": "Person", name: "Chris Sztrakati" },
        roleName: "Drums",
      },
      {
        "@type": "OrganizationRole",
        member: { "@type": "Person", name: "Constantin Kaiser" },
        roleName: ["Bass", "Synthesizer"],
      },
    ],
    recordLabel: {
      "@type": "Organization",
      name: "Tonherd Music",
      url: "https://tonherd.com",
    },
    album: {
      "@type": "MusicAlbum",
      "@id": "https://now-music.at/#album-out",
      name: "OUT",
      datePublished: "2024-10-01",
      numTracks: 15,
      albumProductionType: "https://schema.org/StudioAlbum",
      albumReleaseType: "https://schema.org/AlbumRelease",
      byArtist: { "@id": "https://now-music.at/#band" },
    },
    sameAs: [
      "https://www.instagram.com/now.itsofficial",
      "https://www.facebook.com/profile.php?id=100076664337992",
      "https://open.spotify.com/intl-de/artist/46Z2az8XmrXnhr0ej2sr3Q",
      "https://music.apple.com/at/artist/now/1603132645",
      "https://www.youtube.com/@now.",
      "https://www.bandsintown.com/a/3443904-now.",
      "https://www.deezer.com/artist/156250942",
      "https://www.wikidata.org/wiki/Q138828241",
    ],
  };

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(musicGroupJsonLd) }}
        />
        <Navigation locale={locale as Locale} />
        <SmoothScrollProvider>
          <main>{children}</main>
        </SmoothScrollProvider>
        <Footer locale={locale as Locale} />
        {latestRelease && (
          <NewReleasePopup release={latestRelease} locale={locale} />
        )}
      </body>
    </html>
  );
}
