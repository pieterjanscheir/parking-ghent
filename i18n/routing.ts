import { defineRouting } from "next-intl/routing";

// Every page lives under a language prefix: /nl, /en, /fr, /de, /es. A visit
// without one (e.g. an old link to /parkings/…) is redirected to the
// visitor's language: their earlier choice if they made one, otherwise the
// browser's preferred language, otherwise Dutch.
//
// To add a language: add its code here, add a row to LOCALE_INFO below, and
// add messages/<code>.json (copy en.json and translate it). `pnpm test`
// fails until the new file has every message.
export const routing = defineRouting({
  locales: ["nl", "en", "fr", "de", "es"],
  defaultLocale: "nl",
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_INFO: Record<
  Locale,
  {
    // The language's own name, as shown in the language menu.
    name: string;
    // Language + region code for share previews (Open Graph).
    openGraph: string;
  }
> = {
  nl: { name: "Nederlands", openGraph: "nl_BE" },
  en: { name: "English", openGraph: "en_GB" },
  fr: { name: "Français", openGraph: "fr_BE" },
  de: { name: "Deutsch", openGraph: "de_DE" },
  es: { name: "Español", openGraph: "es_ES" },
};
