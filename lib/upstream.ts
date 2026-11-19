// One place for how we call the city's open-data portal.

// Responses normally arrive in well under a second. A connection that hasn't
// answered by now is almost certainly stuck, so give up on it…
export const ATTEMPT_TIMEOUT_MS = 4_000;
// …and try once more: a stuck connection is usually a one-off, and a fresh one
// goes through. Worst case the caller waits 2 × 4 s.
const ATTEMPTS = 2;

export type UpstreamResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
};

// Retries network-level failures and timeouts only. An HTTP error status is a
// real answer from the portal and is returned to the caller as-is.
//
// The body is read inside each attempt: `fetch` resolves as soon as the
// headers arrive, so a body that stalls halfway has to be caught (and
// retried) here, not by the caller.
export async function fetchUpstream(url: string): Promise<UpstreamResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      // `no-store`: caching is handled by `cached()` in ttl-cache.ts (strict
      // TTL), not by Next's stale-while-revalidate fetch cache.
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, statusText: res.statusText, text };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
