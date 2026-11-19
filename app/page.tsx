import { fetchParkings, serverClock } from "@/lib/parkings";
import { fetchAllTrends } from "@/lib/parking-history";
import type { Metadata } from "next";
import { ParkingOverview } from "@/components/parking-overview";

export const metadata: Metadata = {
  // The overview has many URL variants (?view=map, ?sort=…); they are all
  // this one page as far as search engines are concerned.
  alternates: { canonical: "/" },
};

export default async function Home() {
  // Fire both calls in parallel — the trend feeds are independent of the
  // live snapshot and shouldn't lengthen page TTFB sequentially.
  const [parkings, trendsById] = await Promise.all([
    fetchParkings(),
    fetchAllTrends(),
  ]);
  return (
    <ParkingOverview
      parkings={parkings}
      trendsById={trendsById}
      serverNow={serverClock()}
    />
  );
}
