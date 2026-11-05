"use client";

import { useCallback, useState } from "react";
import type { LatLng } from "./geo";

export type GeoStatus = "idle" | "locating" | "ready" | "denied" | "unavailable";

// Asks for the browser location only when the user opts in (e.g. picks
// "Nearest to me"). Kept in memory only — nothing is stored or sent anywhere.
export function useGeolocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("ready");
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  return { location, status, request };
}
