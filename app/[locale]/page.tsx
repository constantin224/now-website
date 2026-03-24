import type { Metadata } from "next";
import { HeroVideo } from "@/components/hero-video";
import { getMessages, type Locale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  return {
    title: t.meta.site_title,
    description: t.meta.site_description,
    ...localeMetadata(locale as Locale, ""),
  };
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <>
      {/* Visuell verstecktes H1 für SEO — Logo übernimmt die visuelle Rolle */}
      <h1 className="sr-only">Now. — Pop Rock Band aus Wien</h1>
      <HeroVideo locale={locale as Locale} />
    </>
  );
}
