"use client";

import { useEffect, useState } from "react";

// One answer from the city's open data portal, fetched by the visitor's
// browser (see lib/shared-bikes.ts for why not through our server).
//
// Returns the response body, or null while loading and when the request
// fails: these are extras on a page, and a missing extra is left out rather
// than reported.
export function useCityData(url: string): unknown {
  const [answer, setAnswer] = useState<{ url: string; json: unknown } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: unknown) => setAnswer({ url, json }))
      .catch(() => {
        /* aborted, offline or unavailable: stay silent */
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [url]);

  // An answer for an earlier address doesn't apply to this one.
  return answer && answer.url === url ? answer.json : null;
}
