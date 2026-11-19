import { fetchChargeStations } from "@/lib/chargers";

// Every public charge point for electric cars in Ghent, grouped per post, for
// the map's "Charge points" layer. Only fetched when a visitor switches the
// layer on.
export async function GET() {
  try {
    const stations = await fetchChargeStations();
    return Response.json(
      { stations },
      // The list changes a few times a month at most.
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
    );
  } catch {
    return Response.json({ error: "The charge points are unavailable" }, { status: 502 });
  }
}
