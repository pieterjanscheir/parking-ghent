import { defineRouting } from "next-intl/routing";

// Every page lives under a language prefix: /nl, /en, /fr. A visit without
// one (e.g. an old link to /parkings/…) is redirected to the visitor's
// language: their earlier choice if they made one, otherwise the browser's
// preferred language, otherwise Dutch.
export const routing = defineRouting({
  locales: ["nl", "en", "fr"],
  defaultLocale: "nl",
});

export type Locale = (typeof routing.locales)[number];

// How each language is named in the switcher (in its own language).
export const LOCALE_LABELS: Record<Locale, string> = {
  nl: "Nederlands",
  en: "English",
  fr: "Français",
};
