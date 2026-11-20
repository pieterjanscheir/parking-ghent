import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CityNav } from "@/components/city-nav";
import { CityOverview } from "@/components/city-overview";
import { CityRefresh } from "@/components/city-refresh";
import { redirect } from "@/i18n/navigation";
import { getCity } from "@/lib/cities";
import { isCityId } from "@/lib/cities/pages";
import { serverClock } from "@/lib/parkings";
import { languageAlternates } from "@/lib/site";

type Props = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, city } = await params;
  if (!isCityId(city) || city === "ghent") return {};
  const t = await getTranslations({ locale, namespace: "cities" });
  const name = t(`names.${city}`);
  const live = getCity(city).knows.liveCounts;
  return {
    // The root layout's title template appends " — Ghent Parking".
    title: t("title", { city: name }),
    description: live ? t("introLive", { city: name }) : t("introList", { city: name }),
    alternates: {
      canonical: `/${locale}/cities/${city}`,
      languages: languageAlternates(`/cities/${city}`),
    },
  };
}

// One city other than Ghent. Rendered on request: the counts are live.
export default async function CityPage({ params }: Props) {
  const { locale, city: id } = await params;
  setRequestLocale(locale);
  if (!isCityId(id)) notFound();
  // Ghent is the home page, with far more than this page shows.
  if (id === "ghent") redirect({ href: "/", locale });

  const city = getCity(id);
  let data;
  try {
    data = await city.live();
  } catch {
    data = null;
  }
  if (!data) {
    // The city's feed is down: say so, and keep the way to the other cities.
    const t = await getTranslations("cities");
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Keeps asking, so the page comes back by itself once the feed does. */}
        <CityRefresh />
        <CityNav current={id} />
        <h1 className="mt-6 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title", { city: t(`names.${id}`) })}
        </h1>
        <p role="status" className="mt-4 max-w-2xl text-sm text-muted-foreground">
          {t("unavailable", { city: t(`names.${id}`) })}
        </p>
      </div>
    );
  }
  return (
    <CityOverview
      city={{ id: city.id, center: city.center, publisher: city.publisher, openData: city.openData, knows: city.knows }}
      parkings={data.parkings}
      extras={data.extras}
      now={serverClock()}
    />
  );
}
