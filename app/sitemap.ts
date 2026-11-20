import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { OTHER_CITY_IDS } from "@/lib/cities/pages";
import { fetchAllParkings } from "@/lib/parkings";
import { SITE_URL, languageAlternates } from "@/lib/site";

// One entry per page per language, each pointing at its translations.
function entries(path: string): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    Object.entries(languageAlternates(path)).map(([lang, url]) => [
      lang,
      `${SITE_URL}${url}`,
    ]),
  );
  return routing.locales.map((locale) => ({
    url: `${SITE_URL}/${locale}${path}`,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The pages that exist whatever the feeds do.
  const fixed = [
    ...entries(""),
    ...entries("/parked"),
    ...entries("/mcp"),
    ...entries("/cities"),
    ...OTHER_CITY_IDS.flatMap((id) => entries(`/cities/${id}`)),
  ];
  try {
    const { parkings, extras } = await fetchAllParkings();
    return [
      ...fixed,
      ...[...parkings, ...extras].flatMap((p) =>
        entries(`/parkings/${encodeURIComponent(p.id)}`),
      ),
    ];
  } catch {
    // The city's feed is down: still serve a valid sitemap.
    return fixed;
  }
}
