import { getArchiveStore } from "@/lib/archive-store";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { recordSnapshot } from "@/lib/history-archive";
import { isProfileRun, readRecentDays, rebuildProfile } from "@/lib/history-profile-store";
import { rebuildSummary, updateSummary } from "@/lib/history-summary-store";
import { fetchParkings } from "@/lib/parkings";

// Saves the current count of every garage to our own history archive
// (lib/history-archive.ts). Called every 10 minutes by Vercel — see the
// schedule in vercel.json — and safe to call more often: a second call in the
// same 10 minutes changes nothing.

//
// Once a night the same call also works out the weekly pattern from the last
// four weeks (lib/history-profile-store.ts). `?profile=1` does that right
// away, for the first time or after a change to how it is calculated.
//
// From the same four weeks of files it adds the days just finished to the
// long-term summary (lib/history-summary-store.ts), which keeps every day.
// `?summary=1` builds that summary again from every day file stored, for the
// first time or after a change to how it is calculated; `&from=2026-11-19`
// says where to start (the default is the archive's first day).

// One feed request (4 s timeout, one retry) plus a read and a write; at
// night also four weeks of day files; on ?summary=1 every day file, four
// weeks at a time.
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

  const params = new URL(request.url).searchParams;
  const wantsProfile = params.get("profile") === "1" || isProfileRun(now);
  const wantsFullSummary = params.get("summary") === "1";
  if (!wantsProfile && !wantsFullSummary) return Response.json(saved);

  // Each step stands on its own: the snapshot is saved, and a failure in one
  // never stops the others. What failed is tried again at the next nightly
  // run (03:00 UTC or the following midnight), or right away by hand; until
  // then pages keep the previous pattern and summary.
  const result: Record<string, unknown> = { ...saved };
  if (wantsProfile) {
    let recent;
    try {
      recent = await readRecentDays(store, now);
    } catch (err) {
      console.error("Reading the last four weeks failed", err);
      result.profile = { error: message(err) };
      if (!wantsFullSummary) result.summary = { error: message(err) };
    }
    if (recent) {
      try {
        result.profile = await rebuildProfile(store, now, recent);
      } catch (err) {
        console.error("Weekly pattern failed", err);
        result.profile = { error: message(err) };
      }
      // A full rebuild below does the same and more.
      if (!wantsFullSummary) {
        try {
          result.summary = await updateSummary(store, recent, now);
        } catch (err) {
          console.error("Long-term summary failed", err);
          result.summary = { error: message(err) };
        }
      }
    }
  }
  if (wantsFullSummary) {
    const from = params.get("from");
    try {
      if (from !== null && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        throw new Error("from must be a date like 2026-11-19");
      }
      result.summary = await rebuildSummary(store, now, from ?? undefined);
    } catch (err) {
      console.error("Long-term summary rebuild failed", err);
      result.summary = { error: message(err) };
    }
  }
  return Response.json(result);
}
