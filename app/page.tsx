import { fetchParkingsWithRaw } from "@/lib/parkings";
import { fetchAllTrendsWithRaw } from "@/lib/parking-history";
import { JsonBlock } from "@/components/json-block";
import { ParkingOverview } from "@/components/parking-overview";

export default async function Home() {
  // Fire both calls in parallel — the trend feeds are independent of the
  // live snapshot and shouldn't lengthen page TTFB sequentially.
  const [parkingsResult, trendsResult] = await Promise.all([
    fetchParkingsWithRaw(),
    fetchAllTrendsWithRaw(),
  ]);
  const { parkings, calls: parkingCalls } = parkingsResult;
  const { trendsById, calls: trendCalls } = trendsResult;
  const allCalls = [...parkingCalls, ...trendCalls];
  return (
    <>
      <ParkingOverview parkings={parkings} trendsById={trendsById} />
      <section
        aria-label="Raw API responses"
        className="mx-auto max-w-7xl px-6 pb-12"
      >
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Raw API responses
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every upstream call this page made, in the order it was issued.
        </p>
        {allCalls.map((call) => (
          <JsonBlock
            key={call.id}
            data={call.data}
            title={call.title}
            subtitle={call.subtitle}
            defaultOpen={call.id === "bezetting-parkeergarages-real-time"}
          />
        ))}
      </section>
    </>
  );
}
