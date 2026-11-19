import { fetchProfile } from "@/lib/history-profile-store";

// The weekly pattern of every garage, worked out from our own archive:
// /api/typical → { profile: { … } } or { profile: null } while there is none.
//
// It changes once a night, so the CDN keeps it for six hours and nearly all
// requests never reach this function.
export async function GET() {
  try {
    return Response.json(
      { profile: await fetchProfile() },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600" } },
    );
  } catch {
    return Response.json({ error: "The weekly pattern is unavailable" }, { status: 502 });
  }
}
