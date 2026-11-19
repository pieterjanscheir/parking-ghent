"use client";

import { useMemo, useState } from "react";
import {
  CalendarPlus,
  CarFront,
  Footprints,
  Loader2,
  LocateFixed,
  Share2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { formatLatLng, parseLatLng } from "@/lib/geo";
import { reminderIcs } from "@/lib/ics";
import {
  NOTE_MAX_LENGTH,
  STREET_SPOT_ID,
  clockOf,
  isCurrent,
  isStreetSpot,
  parseSharedSpot,
  readParkedSpot,
  unchangedSince,
  untilFromClock,
  useParkedSpot,
  walkingRouteUrl,
  type ParkedSpot,
} from "@/lib/parked";
import { machinesUrl, nearestMachine } from "@/lib/pay-machines";
import { useCityData } from "@/lib/use-city-data";
import { useDeviceNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { useUntilText } from "./parked-here";
import { ParkingBansNote } from "./parking-bans-note";
import { ParkingLocationMap } from "./parking-location-map";
import { StreetZoneNote } from "./street-zone-note";
import { useFormatAge, useFormatTime } from "./use-labels";

type Locating = "idle" | "locating" | "denied" | "unavailable";

const REMINDER_MINUTES_BEFORE = 10;

// "Nearest pay machine: Muinklaan 14, about 60 m away (does not take cash)".
function PayMachineNote({ lat, lng }: { lat: number; lng: number }) {
  const t = useTranslations("parked");
  const json = useCityData(machinesUrl({ lat, lng }));
  const machine = useMemo(
    () => (json === null ? null : nearestMachine(json, { lat, lng })),
    [json, lat, lng],
  );
  if (!machine) return null;
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      {/* Standing right at it still reads better as "about 10 m" than "0 m". */}
      {t("payMachine", { address: machine.address, metres: Math.max(10, machine.metres) })}{" "}
      <span className="text-foreground">({machine.cash ? t("payCash") : t("payNoCash")})</span>
    </p>
  );
}

// "Where did I park?" — the page behind the header's car icon and the
// installed app's shortcut. Shows the saved spot (a car park, or a spot on
// the street) with the way back, and lets a spot on the street be saved from
// the phone's position. For a street spot it adds what matters there: the
// parking zone, the nearest pay machine and the temporary parking bans.
//
// Opened through a shared link (/parked?spot=<lat>,<lng>) it shows that spot
// instead: someone else's car, to walk to.
export function ParkedPage() {
  const t = useTranslations("parked");
  const tActions = useTranslations("actions");
  const locale = useLocale();
  const formatAge = useFormatAge();
  const formatTime = useFormatTime();
  const untilText = useUntilText();
  const now = useDeviceNow();
  const { spot, ready, park, setNote, setUntil, clear } = useParkedSpot();
  const [locating, setLocating] = useState<Locating>("idle");
  const [spotParam, setSpotParam] = useQueryState("spot", parseAsString);
  const shared = parseSharedSpot(spotParam);

  const current = ready && now > 0 && spot && isCurrent(spot, now) ? spot : null;

  function saveWhereIAm() {
    if (!("geolocation" in navigator)) {
      setLocating("unavailable");
      return;
    }
    setLocating("locating");
    // What is saved as the lookup starts (an expired spot counts as none).
    const startedWith = current;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // The lookup took a few seconds. If the spot was cleared or replaced
        // in the meantime, that was the later wish: leave it alone.
        const stored = readParkedSpot();
        const latest = stored && isCurrent(stored, Date.now()) ? stored : null;
        if (!unchangedSince(startedWith, latest)) {
          setLocating("idle");
          return;
        }
        // Moving the pin keeps the note ("opposite number 12" is still true),
        // as it reads now, not as it read when the lookup started.
        const note = latest && isStreetSpot(latest) ? latest.note : "";
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

  // Send the spot to whoever came along: a link to this page with the
  // coordinates for a spot on the street, or to the car park's own page.
  async function shareSpot(target: ParkedSpot) {
    const path = isStreetSpot(target)
      ? `/parked?spot=${formatLatLng(target)}`
      : `/parkings/${encodeURIComponent(target.id)}`;
    const url = `${window.location.origin}/${locale}${path}`;
    const text = [t("shareSpotText"), target.note].filter(Boolean).join(" ");
    const data = { title: t("pageTitle"), text, url };
    try {
      if (navigator.share && navigator.canShare?.(data) !== false) {
        await navigator.share(data);
        return;
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(tActions("copied"));
    } catch {
      toast.error(tActions("shareFailed"));
    }
  }

  // A calendar file with an alert: the phone's own calendar reminds them,
  // also when this site is closed.
  function downloadReminder(target: ParkedSpot, until: number) {
    const ics = reminderIcs({
      uid: `${target.at}@parked.ghent-parking`,
      title: t("reminderTitle"),
      description: [t("reminderBody", { time: formatTime(until) }), target.note]
        .filter(Boolean)
        .join("\n"),
      at: until,
      alertMinutesBefore: REMINDER_MINUTES_BEFORE,
      now: Date.now(),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "parking.ics";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
      <p role="alert" className="mt-3 text-sm text-amber-800 dark:text-amber-200">
        {t(locating)}
      </p>
    ) : null;

  if (shared) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {t("sharedTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("sharedIntro")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <a
              href={walkingRouteUrl(shared)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("walkBackLabel", { name: t("streetCar") })}
            >
              <Footprints className="size-3.5" aria-hidden />
              {t("walkThere")}
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              park({ id: STREET_SPOT_ID, name: STREET_SPOT_ID, ...shared });
              void setSpotParam(null);
              toast.success(t("sharedSaved"));
            }}
          >
            <CarFront className="size-3.5" aria-hidden />
            {t("saveShared")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void setSpotParam(null)}>
            {t("backToMine")}
          </Button>
        </div>
        <ParkingLocationMap
          parking={{ name: t("streetCar"), lat: shared.lat, lng: shared.lng }}
          plainMarker={{ parkAndRide: false }}
        />
      </div>
    );
  }

  const onStreet = current ? isStreetSpot(current) : false;
  // The zone, ban and pay-machine data only cover Ghent.
  const inGhent = current ? parseLatLng(formatLatLng(current)) !== null : false;
  const until = current && current.until !== null ? untilText(current.until, now) : null;

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
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
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
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t("untilLabel")}</span>
                <Input
                  type="time"
                  value={current.until === null ? "" : clockOf(current.until)}
                  onChange={(e) =>
                    setUntil(e.target.value ? untilFromClock(e.target.value, Date.now()) : null)
                  }
                />
              </label>
            </div>
            {until && current.until !== null ? (
              <div className="mt-3">
                <p
                  aria-live="polite"
                  className={cn("text-sm font-medium", until.urgent && "text-amber-800 dark:text-amber-200")}
                >
                  {until.text}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {current.until > now ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => downloadReminder(current, current.until!)}
                    >
                      <CalendarPlus className="size-3.5" aria-hidden />
                      {t("addReminder")}
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setUntil(null)}>
                    {t("clearUntil")}
                  </Button>
                </div>
                {current.until > now ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("reminderNote")}</p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-primary/15 pt-4">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void shareSpot(current)}
              >
                <Share2 className="size-3.5" aria-hidden />
                {t("shareSpot")}
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
                  <PayMachineNote lat={current.lat} lng={current.lng} />
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
