"use client";

import { useLocalStorageJson } from "./local-storage-store";

// Which map the garage page shows. OpenStreetMap is the default because it
// loads nothing from Google; visitors can opt in to Google Maps in settings.
export type MapProvider = "osm" | "google";

export const DEFAULT_MAP_PROVIDER: MapProvider = "osm";

const STORAGE_KEY = "parking.mapProvider.v1";

export function parseMapProvider(raw: string): MapProvider | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value === "osm" || value === "google" ? value : null;
  } catch {
    return null;
  }
}

// The choice lives in this browser only (localStorage). `ready` is false
// during server render and hydration, when the stored choice isn't known yet.
export function useMapProvider(): {
  provider: MapProvider;
  ready: boolean;
  setProvider: (next: MapProvider) => void;
} {
  const { value, mounted, write } = useLocalStorageJson(
    STORAGE_KEY,
    parseMapProvider,
  );
  return {
    provider: value ?? DEFAULT_MAP_PROVIDER,
    ready: mounted,
    setProvider: write,
  };
}
