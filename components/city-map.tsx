"use client";

import dynamic from "next/dynamic";
import type { DirectoryEntry } from "@/lib/directory";
import type { Parking } from "@/lib/parkings.schema";

// Leaflet needs `window`, so the map itself is loaded in the browser only.
const CityMapLeaflet = dynamic(() => import("./city-map-leaflet"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse bg-muted/40" aria-hidden />,
});

export type CityMapProps = {
  parkings: Parking[];
  extras: DirectoryEntry[];
  center: [number, number];
  label: string;
  closedLabel: string;
  routeLabel: string;
  noCountLabel: string;
  // "{free} of {total} free", already in the visitor's language.
  freeOf: Record<string, string>;
};

export function CityMap(props: CityMapProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <CityMapLeaflet {...props} />
    </div>
  );
}
