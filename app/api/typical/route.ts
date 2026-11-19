import { fetchProfile } from "@/lib/history-profile-store";

// The weekly pattern of every garage, worked out from our own archive:
// /api/typical → { profile: { … } } or { profile: null } while there is none.
//
// It changes once a night, so the CDN keeps it for six hours and nearly all
// requests never reach this function. "None yet" is kept only ten minutes,
// so the CDN doesn't hold back the first pattern for six more hours once it
// is built (a running server instance may still take up to three, see
// fetchProfile).
export async function GET() {
  try {
    const profile = await fetchProfile();
    const cache = profile
      ? "public, max-age=3600, s-maxage=21600"
      : "public, max-age=600, s-maxage=600";
    return Response.json({ profile }, { headers: { "Cache-Control": cache } });
  } catch {
    return Response.json({ error: "The weekly pattern is unavailable" }, { status: 502 });
  }
}
