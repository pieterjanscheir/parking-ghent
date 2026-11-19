"use client";

import { useTranslations } from "next-intl";
import { isStale } from "@/lib/freshness";
import type { HistoryPoint, Trend } from "@/lib/parking-history";
import { useNow } from "@/lib/use-now";
import { ParkingHistoryChart } from "./parking-history-chart";

// The history chart for one garage. When the garage's live count has gone
// stale, the trend badge and forecast are dropped (the history line stays):
// a prediction "in 30 min" anchored on an old count would mislead. Checked on
// the client so it also kicks in on a tab that has been left open.
export function ParkingHistorySection({
  points,
  trend,
  totalSpaces,
  lastUpdatedAt,
  serverNow,
}: {
  points: HistoryPoint[];
  trend: Trend | null;
  totalSpaces: number;
  lastUpdatedAt: number | null;
  serverNow: number;
}) {
  const t = useTranslations("history");
  const now = useNow(serverNow);
  const stale = isStale({ lastUpdatedAt }, now);
  return (
    <>
      <ParkingHistoryChart
        points={points}
        trend={stale ? null : trend}
        totalSpaces={totalSpaces}
      />
      {stale && trend ? (
        <p className="mt-4 text-xs text-muted-foreground">{t("noForecast")}</p>
      ) : null}
    </>
  );
}
