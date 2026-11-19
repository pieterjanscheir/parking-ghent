// A small in-memory cache with a strict time-to-live, shared by every request
// this server instance handles.
//
// Why not Next's built-in fetch cache (`next: { revalidate }`)? It is
// stale-while-revalidate: the first visitor after a quiet hour would be served
// hour-old parking counts while a refresh runs in the background. For live
// data that is the wrong trade-off, so this cache never returns a value older
// than its TTL — an expired entry is refetched before anything is returned.
//
// What it buys us: concurrent requests share one upstream call, and upstream
// load is bounded by the TTL instead of growing with the number of visitors.

type Entry = {
  startedAt: number;
  state: "pending" | "ok" | "failed";
  promise: Promise<unknown>;
  lastGood: { value: unknown } | null;
};

const entries = new Map<string, Entry>();

export type CacheOptions = {
  // How long a successful result is reused.
  ttlMs: number;
  // How long a failure is remembered before retrying, so an upstream outage
  // doesn't turn every page view into another (slow) failing request.
  errorTtlMs?: number;
  // Fall back to the last successful value when a refresh fails. Only for data
  // that is still correct when old (the static address list) — never for live
  // counts.
  staleIfError?: boolean;
};

export function cached<T>(
  key: string,
  { ttlMs, errorTtlMs = 5_000, staleIfError = false }: CacheOptions,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit) {
    const maxAge = hit.state === "failed" ? errorTtlMs : ttlMs;
    if (hit.state === "pending" || now - hit.startedAt < maxAge) {
      return hit.promise as Promise<T>;
    }
  }

  const entry: Entry = {
    startedAt: now,
    state: "pending",
    promise: Promise.resolve(),
    lastGood: hit?.lastGood ?? null,
  };
  entry.promise = (async () => load())().then(
    (value) => {
      entry.state = "ok";
      entry.lastGood = { value };
      return value;
    },
    (err) => {
      entry.state = "failed";
      if (staleIfError && entry.lastGood) return entry.lastGood.value;
      throw err;
    },
  );
  entries.set(key, entry);
  return entry.promise as Promise<T>;
}

// Test hook: module state would otherwise leak between test cases.
export function clearCache(): void {
  entries.clear();
}
