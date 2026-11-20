import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CITY_IDS, CITY_INFO } from "@/lib/cities/info";
import { cityPath } from "@/lib/cities/pages";
import { languageAlternates } from "@/lib/site";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cities" });
  return {
    title: t("indexTitle"),
    description: t("indexIntro"),
    alternates: { canonical: `/${locale}/cities`, languages: languageAlternates("/cities") },
  };
}

// Every city the site knows, and what it has for each. Built ahead of time:
// nothing on it changes between visitors.
export default async function CitiesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cities");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{t("indexTitle")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("indexIntro")}</p>
      <ul className="mt-6 space-y-2">
        {CITY_IDS.map((id) => {
          const city = CITY_INFO[id];
          return (
            <li key={id}>
              <Link
                href={cityPath(id)}
                className="group surface-card flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span>
                  <span className="font-heading text-base font-semibold tracking-tight">{t(`names.${id}`)}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {id === "ghent" ? t("kindGhent") : city.knows.liveCounts ? t("kindLive") : t("kindList")}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
