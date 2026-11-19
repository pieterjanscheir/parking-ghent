"use client";

import { useEffect, useState } from "react";
import { ProfileSchema, type Profile } from "./history-profile";

// The weekly pattern, fetched once per visit and shared by every component
// that shows it. `undefined` while loading; `null` when there is none (no
// archive yet, or the request failed — an extra, so nothing is reported).
let request: Promise<Profile | null> | null = null;

function load(): Promise<Profile | null> {
  request ??= fetch("/api/typical")
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { profile?: unknown } | null) => {
      const parsed = ProfileSchema.safeParse(json?.profile);
      return parsed.success ? parsed.data : null;
    })
    .catch(() => {
      // Let a later page try again.
      request = null;
      return null;
    });
  return request;
}

export function useTypicalProfile(): Profile | null | undefined {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void load().then((value) => {
      if (current) setProfile(value);
    });
    return () => {
      current = false;
    };
  }, []);
  return profile;
}
