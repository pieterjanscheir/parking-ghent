"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WEEKDAYS, ghentHour, quietAndBusy, typicalDay } from "@/lib/history-profile";
import { useTypicalProfile } from "@/lib/use-typical-profile";
import { useDeviceNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

// 4 January 2027 is a Monday: a fixed week to take the weekday names from.
const A_MONDAY = Date.UTC(2027, 0, 4, 12);
const DAY_MS = 24 * 60 * 60_000;
// The chart shows the hours people park in; the night is nearly always empty.
const FIRST_HOUR = 6;

const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

// "A typical Thursday" on a garage's page: how much room there usually is,
// hour by hour, from this site's own measurements — and any other day of the
// week, for planning ahead. Renders nothing until there is a pattern for
// this garage.
export function TypicalDay({ garageId, totalSpaces }: { garageId: string; totalSpaces: number }) {
  const t = useTranslations("typical");
  const locale = useLocale();
  const profile = useTypicalProfile();
  const now = useDeviceNow();
  const [chosen, setChosen] = useState<number | null>(null);

  const garage = profile?.garages[garageId];
  if (!profile || !garage || now === 0) return null;

  const today = ghentHour(now);
  const weekday = chosen ?? today.weekday;
  const hours = typicalDay(profile, garageId, weekday).filter((h) => h.hour >= FIRST_HOUR);
  const capacity = Math.max(totalSpaces, garage.c, ...hours.map((h) => h.free), 1);
  const extremes = quietAndBusy(hours);
  const current = weekday === today.weekday ? hours.find((h) => h.hour === today.hour) : undefined;

  const dayName = (index: number, width: "long" | "short") =>
    new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" }).format(A_MONDAY + index * DAY_MS);
  const since = profile.from
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${profile.from}T12:00:00Z`),
      )
    : "";

  return (
    <section
      aria-labelledby="typical-heading"
      className="mt-6 surface-card rounded-xl border border-border/70 p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="typical-heading" className="font-heading text-lg font-semibold tracking-tight">
          {t("title", { weekday: dayName(weekday, "long") })}
        </h2>
        <div role="group" aria-label={t("pickDay")} className="flex gap-1">
          {WEEKDAYS.map((key, index) => (
            <button
              key={key}
              type="button"
              aria-pressed={index === weekday}
              aria-label={dayName(index, "long")}
              onClick={() => setChosen(index)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                index === weekday
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {dayName(index, "short")}
            </button>
          ))}
        </div>
      </div>

      {hours.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("noDay")}</p>
      ) : (
        <>
          <div className="mt-3 space-y-1 text-sm">
            {current ? (
              <p>
                {t("aroundNow", { time: clock(current.hour), free: current.free })}{" "}
                <span className="text-muted-foreground">({t("basedOn", { days: current.days })})</span>
              </p>
            ) : null}
            {extremes ? (
              <p className="text-muted-foreground">
                {t("quietest", { time: clock(extremes.quietest.hour), free: extremes.quietest.free })}{" "}
                {t("busiest", { time: clock(extremes.busiest.hour), free: extremes.busiest.free })}
              </p>
            ) : null}
          </div>

          {/* One bar per hour: its height is the share of the garage that is
              usually free. The list underneath says the same in words. */}
          <div aria-hidden className="mt-5 flex h-28 items-end gap-1">
            {Array.from({ length: 24 - FIRST_HOUR }, (_, i) => i + FIRST_HOUR).map((hour) => {
              const typical = hours.find((h) => h.hour === hour);
              const isNow = weekday === today.weekday && hour === today.hour;
              return (
                <div key={hour} className="flex h-full flex-1 flex-col justify-end">
                  {typical ? (
                    <div
                      title={t("bar", { time: clock(hour), free: typical.free })}
                      style={{ height: `${Math.max(3, (typical.free / capacity) * 100)}%` }}
                      className={cn("rounded-t-sm", isNow ? "bg-primary" : "bg-primary/35")}
                    />
                  ) : (
                    <div className="h-px bg-border" />
                  )}
                </div>
              );
            })}
          </div>
          {/* Each label sits under the middle of its own bar. */}
          <div aria-hidden className="relative mt-1 h-4 text-[10px] tabular-nums text-muted-foreground">
            {[FIRST_HOUR, 9, 12, 15, 18, 21].map((hour) => (
              <span
                key={hour}
                className="absolute -translate-x-1/2"
                style={{ left: `${((hour - FIRST_HOUR + 0.5) / (24 - FIRST_HOUR)) * 100}%` }}
              >
                {clock(hour)}
              </span>
            ))}
          </div>
          <ul className="sr-only">
            {hours.map((h) => (
              <li key={h.hour}>{t("bar", { time: clock(h.hour), free: h.free })}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{t("source", { since })}</p>
    </section>
  );
}
