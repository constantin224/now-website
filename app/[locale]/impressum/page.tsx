import type { Metadata } from "next";
import { siteConfig } from "@/data/site";
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
    title: t.impressum.title,
    robots: { index: false },
    ...localeMetadata(locale as Locale, "/impressum"),
  };
}

export default async function ImpressumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  const imp = siteConfig.impressum;

  return (
    <section className="max-w-2xl mx-auto px-6 py-20 pt-32">
      {/* Impressum */}
      <h1 className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
        {t.impressum.title}
      </h1>

      <p className="text-sand/50 text-sm mb-6">
        {t.impressum.legal_note}
      </p>

      <div className="text-sand/50 text-sm space-y-1 mb-6">
        <p className="text-sand/70 font-medium">{imp.firma}</p>
        <p>{imp.adresse}</p>
      </div>

      <div className="text-sand/50 text-sm space-y-1 mb-6">
        <p>Kontakt: <a href={`mailto:${imp.kontakt}`} className="text-terracotta hover:text-terracotta/80 transition-colors">{imp.kontakt}</a></p>
        <p>UID: {imp.uid}</p>
        <p>{imp.fn}, {imp.gericht}</p>
      </div>

      <div className="text-sand/50 text-sm space-y-1 mb-6">
        <p>Gesellschafter: {imp.gesellschafter}</p>
        <p>(persönlich haftend, einzelvertretungsbefugt)</p>
      </div>

      <p className="text-sand/50 text-sm mb-16">
        {t.impressum.business}
      </p>

      {/* Datenschutz */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
        {t.impressum.privacy_title}
      </p>

      <div className="text-sand/50 text-sm space-y-4">
        <p>{t.impressum.privacy_text_1}</p>
        <p>{t.impressum.privacy_text_2}</p>
      </div>
    </section>
  );
}
