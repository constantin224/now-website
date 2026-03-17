import { HeroVideo } from "@/components/hero-video";
import { getMessages, type Locale } from "@/lib/i18n";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  return <HeroVideo locale={locale as Locale} />;
}
