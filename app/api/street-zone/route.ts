import { parseLatLng } from "@/lib/geo";
import { fetchStreetZones, zoneAt } from "@/lib/street-zones";

// Which street-parking zone a spot is in: /api/street-zone?at=51.05718,3.72077
// → { zone: { color: "red", url: "https://stad.gent/…" } } or { zone: null }.
//
// The zones' outlines (about 300 KB) stay on the server; the browser only
// gets the answer for the one spot it asked about.
export async function GET(request: Request) {
  const point = parseLatLng(new URL(request.url).searchParams.get("at"));
  if (!point) {
    return Response.json({ error: "Expected ?at=<lat>,<lng> in the Ghent area" }, { status: 400 });
  }
  try {
    const zone = zoneAt(await fetchStreetZones(), point);
    return Response.json(
      { zone },
      // The zones change a few times a year at most.
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
    );
  } catch {
    return Response.json({ error: "The street-parking zones are unavailable" }, { status: 502 });
  }
}
