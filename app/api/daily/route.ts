import { garageDays } from "@/lib/history-summary";
import { fetchSummary } from "@/lib/history-summary-store";

// How full one garage was, day by day, from our own archive:
// /api/daily?garage=parking-reep → { garage: { from, builtAt, days } }, or
// { garage: null } while it has no days yet.
//
// One garage at a time: a page only needs its own garage, about 15 KB for a
// year instead of the whole file. The summary changes once a night, so the
// CDN keeps each answer for six hours and nearly all requests never reach
// this function. "None yet" is kept only ten minutes, so the first summary
// isn't held back for six more hours once it is built (a running server
// instance may still take up to three, see fetchSummary).
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("garage") ?? "";
  if (!/^[a-z0-9-]{1,80}$/.test(id)) {
    return Response.json({ error: "Give a garage id: ?garage=parking-reep" }, { status: 400 });
  }
  try {
    const garage = garageDays(await fetchSummary(), id);
    const cache = garage
      ? "public, max-age=3600, s-maxage=21600"
      : "public, max-age=600, s-maxage=600";
    return Response.json({ garage }, { headers: { "Cache-Control": cache } });
  } catch {
    return Response.json({ error: "The long-term summary is unavailable" }, { status: 502 });
  }
}
