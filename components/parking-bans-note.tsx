"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  BAN_LOOKAHEAD_DAYS,
  BAN_RADIUS_M,
  banDateParts,
  bansUrl,
  clockDate,
  parseBans,
  type ParkingBan,
} from "@/lib/parking-bans";
import { cn } from "@/lib/utils";

type Answer = { key: string; bans: ParkingBan[]; at: number };

// One more try after a failed request: a warning that can save a towed car
// is worth a second attempt on a flaky connection.
async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch (err) {
      if (attempt >= 1 || signal.aborted) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
}

// For a car parked on the street: the temporary parking bans the city has
// granted around that spot, running now or starting this week. Fetched by
// the browser from the city's open data (see lib/parking-bans.ts). Shows
// nothing while loading and nothing when the answer can't be had — silence
// must not be read as "no bans".
export function ParkingBansNote({ lat, lng, className }: { lat: number; lng: number; className?: string }) {
  const t = useTranslations("bans");
  const locale = useLocale();
  const key = `${lat},${lng}`;
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    fetchJson(bansUrl({ lat, lng }), controller.signal)
      .then((json) => {
        const at = Date.now();
        setAnswer({ key: `${lat},${lng}`, bans: parseBans(json, { lat, lng }, at), at });
      })
      .catch(() => {
        /* aborted, offline or unavailable: stay silent */
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [lat, lng]);

  // An answer for an earlier spot doesn't apply to this one.
  if (!answer || answer.key !== key) return null;

  // The city's times are clock times in Ghent; `clockDate` carries them as
  // UTC so they print the same on a phone set to another time zone.
  const clock = { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" } as const;
  const day = { weekday: "short", day: "numeric", month: "short" } as const;
  const print = (text: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(clockDate(text));
  const rangeOf = (ban: ParkingBan) => {
    const parts = banDateParts(ban, answer.at);
    const year = { year: "numeric" } as const;
    return {
      from: print(ban.from, { ...day, ...clock, ...(parts.fromYear ? year : {}) }),
      until: parts.untilTimeOnly
        ? print(ban.until, clock)
        : print(ban.until, { ...day, ...clock, ...(parts.untilYear ? year : {}) }),
    };
  };

  return (
    <section aria-labelledby="bans-heading" className={className}>
      <h2 id="bans-heading" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </h2>
      {answer.bans.length === 0 ? (
        <p className="mt-1.5 text-sm">
          {t("none", { metres: BAN_RADIUS_M, days: BAN_LOOKAHEAD_DAYS })}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {answer.bans.map((ban, index) => (
            <li
              key={index}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
                ban.active
                  ? "border-amber-400/50 bg-amber-400/[0.07]"
                  : "border-border/60 bg-card/40",
              )}
            >
              <TriangleAlert
                className={cn("mt-0.5 size-4 shrink-0", ban.active ? "text-amber-300" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="font-medium">{t(`kinds.${ban.kind}`)}</span>{" "}
                {ban.active ? (
                  <span className="ml-1 rounded-4xl bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-200">
                    {t("active")}
                  </span>
                ) : null}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("range", rangeOf(ban))}
                  {" · "}
                  {ban.metres < 20 ? t("here") : t("away", { metres: ban.metres })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("caveat")}</p>
    </section>
  );
}
