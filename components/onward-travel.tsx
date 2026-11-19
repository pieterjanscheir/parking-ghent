"use client";

import { useEffect, useMemo, useState } from "react";
import { Bike, Bus, ExternalLink, TramFront } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  BIKE_PROVIDERS,
  BIKE_PROVIDER_NAMES,
  bikesUrl,
  countBikes,
  onwardRouteUrl,
  type BikeProvider,
} from "@/lib/shared-bikes";
import { nearestStops, stopsUrl } from "@/lib/transit-stops";
import { useCityData } from "@/lib/use-city-data";

type Counts = Partial<Record<BikeProvider, { count: number; atLeast: boolean }>>;

// On a Park & Ride page: how to carry on to the centre (public transport or
// bike, as a route in Google Maps), which bus and tram stops are nearest, and
// how many shared bikes stand nearby right now. Stops and bikes come straight
// from the city's open data to the visitor's browser — see lib/shared-bikes.ts.
export function OnwardTravel({ lat, lng }: { lat: number; lng: number }) {
  const t = useTranslations("onward");
  // Filled in operator by operator as each feed answers, so one slow feed
  // doesn't hold back the others. An operator whose feed fails is left out.
  const [counts, setCounts] = useState<Counts>({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void Promise.all(
      BIKE_PROVIDERS.map(async (provider) => {
        try {
          const res = await fetch(bikesUrl(provider, { lat, lng }), { signal: controller.signal });
          if (!res.ok) return;
          const found = countBikes(provider, await res.json());
          if (current) setCounts((earlier) => ({ ...earlier, [provider]: found }));
        } catch {
          // Offline, blocked or too slow: this operator simply isn't shown.
        }
      }),
    ).then(() => {
      window.clearTimeout(timeout);
      if (current) setDone(true);
    });
    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
      // What was counted here says nothing about the next spot.
      setCounts({});
      setDone(false);
    };
  }, [lat, lng]);

  const stopsJson = useCityData(stopsUrl({ lat, lng }));
  const stops = useMemo(
    () => (stopsJson === null ? [] : nearestStops(stopsJson, { lat, lng })),
    [stopsJson, lat, lng],
  );

  const withBikes = BIKE_PROVIDERS.filter((provider) => (counts[provider]?.count ?? 0) > 0);
  // "No bikes" is only true when every operator answered. With one or more
  // feeds missing and no bikes found, say nothing rather than guess.
  const answered = Object.keys(counts).length;
  const knowsNothing = done && withBikes.length === 0 && answered < BIKE_PROVIDERS.length;

  return (
    <section aria-labelledby="onward-heading" className="mt-8">
      <h2 id="onward-heading" className="font-heading text-lg font-semibold tracking-tight">
        {t("title")}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("toCentre")}</span>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={onwardRouteUrl({ lat, lng }, "transit")} target="_blank" rel="noopener noreferrer">
            <Bus className="size-3.5" aria-hidden />
            {t("transit")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={onwardRouteUrl({ lat, lng }, "bicycling")} target="_blank" rel="noopener noreferrer">
            <Bike className="size-3.5" aria-hidden />
            {t("bike")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("routeNote")}</p>

      {stops.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("stopsTitle")}
          </h3>
          <ul className="mt-1.5 space-y-1 text-sm">
            {stops.map((stop) => (
              <li key={stop.name} className="flex items-baseline gap-2">
                {stop.tram ? (
                  <TramFront className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
                ) : (
                  <Bus className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
                )}
                <span className="font-medium">{stop.name}</span>
                <span className="text-xs text-muted-foreground">
                  {stop.bus && stop.tram ? t("busAndTram") : stop.tram ? t("tram") : t("bus")}
                  {" · "}
                  {stop.metres} m
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {knowsNothing ? null : (
        <div className="mt-5" aria-live="polite">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("bikesTitle")}
          </h3>
          {withBikes.length === 0 ? (
            done ? (
              <p className="mt-1.5 text-sm">{t("bikesNone")}</p>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">{t("bikesLoading")}</p>
            )
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {withBikes.map((provider) => (
                <li
                  key={provider}
                  className="inline-flex items-center gap-1.5 rounded-4xl border border-border/60 bg-card/40 px-2.5 py-1 text-sm"
                >
                  <Bike className="size-3.5 text-muted-foreground" aria-hidden />
                  {BIKE_PROVIDER_NAMES[provider]}
                  <span className="font-semibold tabular-nums">
                    {counts[provider]!.count}
                    {counts[provider]!.atLeast ? "+" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">{t("bikesSource")}</p>
        </div>
      )}
    </section>
  );
}
