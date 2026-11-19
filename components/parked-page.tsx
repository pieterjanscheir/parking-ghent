"use client";

import { useState } from "react";
import { CarFront, Footprints, Loader2, LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { formatLatLng, parseLatLng } from "@/lib/geo";
import {
  NOTE_MAX_LENGTH,
  STREET_SPOT_ID,
  isCurrent,
  isStreetSpot,
  useParkedSpot,
  walkingRouteUrl,
} from "@/lib/parked";
import { useDeviceNow } from "@/lib/use-now";
import { ParkingBansNote } from "./parking-bans-note";
import { ParkingLocationMap } from "./parking-location-map";
import { StreetZoneNote } from "./street-zone-note";
import { useFormatAge, useFormatTime } from "./use-labels";

type Locating = "idle" | "locating" | "denied" | "unavailable";

// "Where did I park?" — the page behind the header's car icon and the
// installed app's shortcut. Shows the saved spot (a car park, or a spot on
// the street) with the way back, and lets a spot on the street be saved from
// the phone's position. For a street spot it adds what matters there: the
// parking zone and the temporary parking bans around it.
export function ParkedPage() {
  const t = useTranslations("parked");
  const formatAge = useFormatAge();
  const formatTime = useFormatTime();
  const now = useDeviceNow();
  const { spot, ready, park, setNote, clear } = useParkedSpot();
  const [locating, setLocating] = useState<Locating>("idle");

  const current = ready && now > 0 && spot && isCurrent(spot, now) ? spot : null;

  function saveWhereIAm() {
    if (!("geolocation" in navigator)) {
      setLocating("unavailable");
      return;
    }
    setLocating("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Moving the pin keeps the note: "opposite number 12" is still true.
        const note = current && isStreetSpot(current) ? current.note : "";
        park(
          {
            id: STREET_SPOT_ID,
            name: STREET_SPOT_ID,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          note,
        );
        setLocating("idle");
        const metres = Math.max(5, Math.round(position.coords.accuracy / 5) * 5);
        toast.success(t("streetSaved", { metres }));
      },
      (error) => {
        setLocating(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      // The car's exact spot matters here, and an earlier position won't do.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const saveButton = (label: string, variant: "default" | "outline") => (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className="gap-1.5"
      onClick={saveWhereIAm}
      disabled={locating === "locating"}
    >
      {locating === "locating" ? (
        <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
      ) : (
        <LocateFixed className="size-3.5" aria-hidden />
      )}
      {locating === "locating" ? t("locating") : label}
    </Button>
  );
  const problem =
    locating === "denied" || locating === "unavailable" ? (
      <p role="alert" className="mt-3 text-sm text-amber-200">
        {t(locating)}
      </p>
    ) : null;

  const onStreet = current ? isStreetSpot(current) : false;
  // The zone and ban data only cover Ghent.
  const inGhent = current ? parseLatLng(formatLatLng(current)) !== null : false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
        {t("pageTitle")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("pageIntro")}</p>

      {!ready || now === 0 ? (
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      ) : !current ? (
        <div className="mt-6 surface-card rounded-xl border border-border/70 p-5">
          <p className="font-heading text-base font-semibold">{t("none")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("saveHereHint")}</p>
          <div className="mt-4">{saveButton(t("saveHere"), "default")}</div>
          {problem}
          <p className="mt-6 border-t border-border/60 pt-4 text-sm text-muted-foreground">
            {t("garageHint")}{" "}
            <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("toOverview")}
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border border-primary/40 bg-primary/[0.05] p-5">
            <p className="inline-flex items-center gap-2 font-heading text-base font-semibold">
              <CarFront className="size-4 shrink-0 text-primary" aria-hidden />
              {onStreet ? t("streetTitle") : t("bannerTitle", { name: current.name })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("since", { time: formatTime(current.at), age: formatAge(now - current.at) })}
            </p>
            <label className="mt-4 block max-w-sm">
              <span className="mb-1 block text-xs text-muted-foreground">
                {onStreet ? t("streetNoteLabel") : t("noteLabel")}
              </span>
              <Input
                type="text"
                value={current.note}
                maxLength={NOTE_MAX_LENGTH}
                placeholder={onStreet ? t("streetNotePlaceholder") : t("notePlaceholder")}
                onChange={(e) => setNote(e.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button asChild size="sm" className="gap-1.5">
                <a
                  href={walkingRouteUrl(current)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("walkBackLabel", {
                    name: onStreet ? t("streetCar") : current.name,
                  })}
                >
                  <Footprints className="size-3.5" aria-hidden />
                  {t("walkBack")}
                </a>
              </Button>
              {onStreet ? (
                saveButton(t("update"), "outline")
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/parkings/${encodeURIComponent(current.id)}`}>{t("garagePage")}</Link>
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={clear}>
                {t("clear")}
              </Button>
            </div>
            {problem}
          </div>

          {onStreet ? (
            <>
              <ParkingLocationMap
                parking={{ name: t("streetCar"), lat: current.lat, lng: current.lng }}
                plainMarker={{ parkAndRide: false }}
              />
              {inGhent ? (
                <>
                  <StreetZoneNote
                    label={t("zoneLabel")}
                    at={current}
                    className="mt-6 text-sm"
                  />
                  <ParkingBansNote lat={current.lat} lng={current.lng} className="mt-6" />
                  <p className="mt-6 text-xs text-muted-foreground">{t("lookupNote")}</p>
                </>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">{t("privacy")}</p>
          )}
        </>
      )}
    </div>
  );
}
