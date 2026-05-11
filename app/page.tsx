import { fetchParkingsWithRaw } from "@/lib/parkings";
import { fetchAllTrends } from "@/lib/parking-history";
import { JsonBlock } from "@/components/json-block";
import { ParkingOverview } from "@/components/parking-overview";

export default async function Home() {
  // Fire both calls in parallel — the trend feeds are independent of the
  // live snapshot and shouldn't lengthen page TTFB sequentially.
  const [{ parkings, raw }, trendsById] = await Promise.all([
    fetchParkingsWithRaw(),
    fetchAllTrends(),
  ]);
  return (
    <>
      <ParkingOverview parkings={parkings} trendsById={trendsById} />
      <div className="mx-auto max-w-7xl px-6 pb-12">
        <JsonBlock
          data={raw}
          title="Raw API response"
          subtitle="gent.opendatasoft.com — bezetting-parkeergarages-real-time"
        />
      </div>
    </>
  );
}
