import { fetchParkingsWithRaw } from "@/lib/parkings";
import { JsonBlock } from "@/components/json-block";
import { ParkingOverview } from "@/components/parking-overview";

export default async function Home() {
  const { parkings, raw } = await fetchParkingsWithRaw();
  return (
    <>
      <ParkingOverview parkings={parkings} />
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
