import { fetchParkings } from "@/lib/parkings";
import { fetchAllTrends } from "@/lib/parking-history";
import { ParkingOverview } from "@/components/parking-overview";

export default async function Home() {
  // Fire both calls in parallel — the trend feeds are independent of the
  // live snapshot and shouldn't lengthen page TTFB sequentially.
  const [parkings, trendsById] = await Promise.all([
    fetchParkings(),
    fetchAllTrends(),
  ]);
  return (
    <ParkingOverview parkings={parkings} trendsById={trendsById} />
  );
}
