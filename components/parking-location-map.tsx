"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useMapProvider } from "@/lib/map-provider";
import type { Parking } from "@/lib/parkings.schema";

const MAP_HEIGHT = "h-[360px]";

// Leaflet touches `window` at import time, so it is client-only.
const ParkingLocationLeaflet = dynamic(
  () => import("./parking-location-leaflet"),
  {
    ssr: false,
    loading: () => <Skeleton className={`${MAP_HEIGHT} w-full rounded-none`} />,
  },
);

// The map on a garage page: OpenStreetMap by default, or an embedded Google
// map for visitors who chose that in settings. Nothing is requested from
// Google unless they did.
export function ParkingLocationMap({
  parking,
  plainMarker,
}: {
  parking: Pick<Parking, "name" | "lat" | "lng"> | Parking;
  // For a car park without a live count: what the marker says instead.
  plainMarker?: { parkAndRide: boolean };
}) {
  const t = useTranslations("settings");
  const tDetail = useTranslations("detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { provider, ready, setProvider } = useMapProvider();

  if (parking.lat === null || parking.lng === null) return null;
  const label = tDetail("mapTitle", { name: parking.name });

  return (
    <div className="mt-6 surface-card overflow-hidden rounded-xl border border-border/70">
      {!ready ? (
        // The stored choice isn't known until the page is live in the
        // browser; show neither map rather than guess (and maybe load Google
        // for someone who didn't ask for it).
        <Skeleton className={`${MAP_HEIGHT} w-full rounded-none`} />
      ) : provider === "google" ? (
        <iframe
          title={label}
          src={`https://www.google.com/maps?q=${parking.lat},${parking.lng}&z=16&hl=${locale}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className={`block ${MAP_HEIGHT} w-full border-0`}
        />
      ) : (
        <ParkingLocationLeaflet
          marker={plainMarker ? { name: parking.name, ...plainMarker } : (parking as Parking)}
          position={[parking.lat, parking.lng]}
          closedLabel={tCommon("closed")}
          label={label}
        />
      )}
      <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
        <span>{t("changeHint")}</span>
        {ready ? (
          <button
            type="button"
            onClick={() => setProvider(provider === "google" ? "osm" : "google")}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {provider === "google" ? t("switchToOsm") : t("switchToGoogle")}
          </button>
        ) : null}
      </p>
    </div>
  );
}
