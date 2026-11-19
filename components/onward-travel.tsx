"use client";

import { useEffect, useState } from "react";
import { Bike, Bus, ExternalLink } from "lucide-react";
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

type Counts = Partial<Record<BikeProvider, { count: number; atLeast: boolean }>>;

// On a Park & Ride page: how to carry on to the centre (public transport or
// bike, as a route in Google Maps) and how many shared bikes stand nearby
// right now. The bikes come straight from the city's open data to the
// visitor's browser — see lib/shared-bikes.ts.
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
    };
  }, [lat, lng]);

  const withBikes = BIKE_PROVIDERS.filter((provider) => (counts[provider]?.count ?? 0) > 0);
  // Every feed failed: say nothing rather than "no bikes".
  const knowsNothing = done && Object.keys(counts).length === 0;

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
