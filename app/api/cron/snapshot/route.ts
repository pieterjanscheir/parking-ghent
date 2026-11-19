import { getArchiveStore } from "@/lib/archive-store";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { recordSnapshot } from "@/lib/history-archive";
import { isProfileRun, rebuildProfile } from "@/lib/history-profile-store";
import { fetchParkings } from "@/lib/parkings";

// Saves the current count of every garage to our own history archive
// (lib/history-archive.ts). Called every 10 minutes by Vercel — see the
// schedule in vercel.json — and safe to call more often: a second call in the
// same 10 minutes changes nothing.

//
// Once a night the same call also works out the weekly pattern from the last
// four weeks (lib/history-profile-store.ts). `?profile=1` does that right
// away, for the first time or after a change to how it is calculated.

// One feed request (4 s timeout, one retry) plus a read and a write; at
// night also four weeks of day files.
export const maxDuration = 30;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = getArchiveStore();
  if (!store) {
    return Response.json(
      { error: "No storage is configured for the history archive" },
      { status: 503 },
    );
  }

  let parkings;
  try {
    parkings = await fetchParkings();
  } catch (err) {
    // Nothing is saved for this slot: a gap is better than a made-up reading.
    return Response.json(
      { error: "The city feed could not be read", detail: message(err) },
      { status: 502 },
    );
  }

  const now = Date.now();
  let saved;
  try {
    saved = await recordSnapshot(store, parkings, now);
  } catch (err) {
    console.error("History snapshot failed", err);
    return Response.json(
      { error: "The snapshot could not be saved", detail: message(err) },
      { status: 500 },
    );
  }

  const asked = new URL(request.url).searchParams.get("profile") === "1";
  if (!asked && !isProfileRun(now)) return Response.json(saved);
  try {
    return Response.json({ ...saved, profile: await rebuildProfile(store, now) });
  } catch (err) {
    // The snapshot is saved; the pattern is tried again at the next run.
    console.error("Weekly pattern failed", err);
    return Response.json({ ...saved, profile: { error: message(err) } });
  }
}
