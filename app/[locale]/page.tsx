import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { fetchAllParkings, serverClock } from "@/lib/parkings";
import { fetchAllTrends } from "@/lib/parking-history";
import { languageAlternates } from "@/lib/site";
import { ParkingOverview } from "@/components/parking-overview";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    // The overview has many URL variants (?view=map, ?sort=…); they are all
    // this one page as far as search engines are concerned.
    alternates: {
      canonical: `/${locale}`,
      languages: languageAlternates(""),
    },
  };
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Fire both calls in parallel — the trend feeds are independent of the
  // live snapshot and shouldn't lengthen page TTFB sequentially.
  const [{ parkings, extras }, trendsById] = await Promise.all([
    fetchAllParkings(),
    fetchAllTrends(),
  ]);
  return (
    <ParkingOverview
      parkings={parkings}
      extras={extras}
      trendsById={trendsById}
      serverNow={serverClock()}
    />
  );
}
