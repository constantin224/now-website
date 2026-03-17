import de from "@/messages/de.json";
import en from "@/messages/en.json";

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";

const messages = { de, en } as const;

// Typ für die Übersetzungen
export type Messages = typeof de;

export function getMessages(locale: Locale): Messages {
  return messages[locale] || messages[defaultLocale];
}

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
