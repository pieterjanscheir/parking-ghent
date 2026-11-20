"use client";

import { useEffect, useState } from "react";
import { GarageDaysSchema, type GarageDays } from "./history-summary";

// One garage's long-term summary, fetched once per visit per garage.
// `undefined` while loading; `null` when there is none (no archive yet, a
// garage that was never measured, or the request failed — an extra, so
// nothing is reported).
const requests = new Map<string, Promise<GarageDays | null>>();

function load(garageId: string): Promise<GarageDays | null> {
  let request = requests.get(garageId);
  if (!request) {
    request = fetch(`/api/daily?garage=${encodeURIComponent(garageId)}`)
      // A server error is a failure, not an answer: it must reach the catch
      // below so a later page asks again.
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { garage?: unknown } | null) => {
        const parsed = GarageDaysSchema.safeParse(json?.garage);
        return parsed.success ? parsed.data : null;
      })
      .catch(() => {
        // Let a later page try again.
        requests.delete(garageId);
        return null;
      });
    requests.set(garageId, request);
  }
  return request;
}

export function useGarageDays(garageId: string): GarageDays | null | undefined {
  const [state, setState] = useState<{ id: string; value: GarageDays | null } | null>(null);
  useEffect(() => {
    let current = true;
    void load(garageId).then((value) => {
      if (current) setState({ id: garageId, value });
    });
    return () => {
      current = false;
    };
  }, [garageId]);
  return state && state.id === garageId ? state.value : undefined;
}
