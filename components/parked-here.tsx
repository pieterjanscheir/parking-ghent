"use client";

import { CarFront, Footprints, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import {
  NOTE_MAX_LENGTH,
  isCurrent,
  isStreetSpot,
  timeLeft,
  useParkedSpot,
  walkingRouteUrl,
} from "@/lib/parked";
import { useDeviceNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { useFormatAge, useFormatTime } from "./use-labels";

type Place = { id: string; name: string; lat: number | null; lng: number | null };

// "Runs out at 18:30, in 40 min" / "Ran out at 18:30, 5 min ago" for the
// time a visitor set on their spot. `urgent` from a quarter of an hour before.
export function useUntilText(): (until: number, now: number) => { text: string; urgent: boolean } {
  const t = useTranslations("parked");
  const formatAge = useFormatAge();
  const formatTime = useFormatTime();
  return (until, now) => {
    const left = timeLeft(until, now);
    const time = formatTime(until);
    if (left.passed) {
      return { text: t("untilPassed", { time, age: formatAge(now - until) }), urgent: true };
    }
    const leftText =
      left.hours > 0
        ? t("inHours", { hours: left.hours, minutes: left.minutes })
        : t("inMinutes", { count: left.minutes });
    return { text: t("untilRunning", { time, left: leftText }), urgent: left.totalMinutes <= 15 };
  };
}

// On a car park's page: "I parked here", and once they did, when that was,
// a note for the level or spot, and a way to clear it again.
export function ParkedHere({ place, className }: { place: Place; className?: string }) {
  const t = useTranslations("parked");
  const formatAge = useFormatAge();
  const formatTime = useFormatTime();
  const now = useDeviceNow();
  const { spot, ready, park, setNote, clear } = useParkedSpot();

  // Without a position there is nothing to walk back to.
  if (place.lat === null || place.lng === null) return null;
  const position = { lat: place.lat, lng: place.lng };
  const parkedHere = ready && now > 0 && spot?.id === place.id && isCurrent(spot, now);

  if (!parkedHere || !spot) {
    return (
      <div className={className}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            park({ id: place.id, name: place.name, ...position });
            toast.success(t("saved", { name: place.name }));
          }}
        >
          <CarFront className="size-3.5" aria-hidden />
          {t("button")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/40 bg-primary/[0.05] p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 font-heading text-sm font-semibold">
            <CarFront className="size-4 text-primary" aria-hidden />
            {t("here")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("since", { time: formatTime(spot.at), age: formatAge(now - spot.at) })}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          {t("clear")}
        </Button>
      </div>
      <label className="mt-3 block max-w-sm">
        <span className="mb-1 block text-xs text-muted-foreground">{t("noteLabel")}</span>
        <Input
          type="text"
          value={spot.note}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t("notePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="mt-2 text-xs text-muted-foreground">{t("privacy")}</p>
    </div>
  );
}

// On the overview: a reminder of where the car is, with a walking route back.
export function ParkedBanner() {
  const t = useTranslations("parked");
  const tAdvice = useTranslations("advice");
  const formatAge = useFormatAge();
  const formatTime = useFormatTime();
  const now = useDeviceNow();
  const { spot, ready, clear } = useParkedSpot();
  const untilText = useUntilText();

  if (!ready || now === 0 || !spot || !isCurrent(spot, now)) return null;
  const until = spot.until === null ? null : untilText(spot.until, now);
  // A spot on the street has no car park page; its details are on /parked.
  const onStreet = isStreetSpot(spot);
  const title = onStreet ? t("streetTitle") : t("bannerTitle", { name: spot.name });
  return (
    <section
      aria-label={title}
      className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-primary/40 bg-primary/[0.05] px-4 py-3"
    >
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1.5 font-heading text-sm font-semibold">
          <CarFront className="size-4 shrink-0 text-primary" aria-hidden />
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("since", { time: formatTime(spot.at), age: formatAge(now - spot.at) })}
          {spot.note ? <span className="text-foreground"> · {spot.note}</span> : null}
        </p>
        {until ? (
          <p
            className={cn(
              "mt-0.5 text-xs font-medium",
              until.urgent ? "text-amber-200" : "text-foreground",
            )}
          >
            {until.text}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="gap-1.5">
          <a
            href={walkingRouteUrl(spot)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("walkBackLabel", { name: onStreet ? t("streetCar") : spot.name })}
          >
            <Footprints className="size-3.5" aria-hidden />
            {t("walkBack")}
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={onStreet ? "/parked" : `/parkings/${encodeURIComponent(spot.id)}`}>
            {tAdvice("details")}
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={clear}
          aria-label={t("clearLabel")}
          title={t("clearLabel")}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
