import type { Metadata } from "next";
import { siteConfig } from "@/data/site";
import { getMessages, type Locale } from "@/lib/i18n";

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
  };
}

export default async function ImpressumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  return (
    <section className="max-w-2xl mx-auto px-6 py-20 pt-32">
      {/* Impressum */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
        {t.impressum.title}
      </p>

      <p className="text-sand-50 text-sm mb-6">
        {t.impressum.legal_note}
      </p>

      <div className="text-sand-50 text-sm space-y-1 mb-6">
        <p>{siteConfig.impressum.firma}</p>
        <p>{siteConfig.impressum.adresse}</p>
        <p className="text-sand-38">{t.impressum.address_tbd}</p>
      </div>

      <div className="text-sand-50 text-sm space-y-1 mb-6">
        <p>Kontakt: {siteConfig.impressum.kontakt}</p>
        <p>UID: <span className="text-sand-38">{t.impressum.uid_tbd}</span></p>
      </div>

      <p className="text-sand-50 text-sm mb-16">
        {t.impressum.business}
      </p>

      {/* Datenschutz */}
      <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-8">
        {t.impressum.privacy_title}
      </p>

      <div className="text-sand-50 text-sm space-y-4">
        <p>{t.impressum.privacy_text_1}</p>
        <p>{t.impressum.privacy_text_2}</p>
      </div>
    </section>
  );
}
