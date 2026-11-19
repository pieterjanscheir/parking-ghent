"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { dataAgeMs, isStale } from "@/lib/freshness";
import type { Parking } from "@/lib/parkings.schema";
import { useNow } from "@/lib/use-now";
import { StaleDataWarning } from "./live-data-warning";
import { useFormatAge } from "./use-labels";

// "Updated 2 min ago" for one garage. It keeps counting while the page stays
// open, so a tab left on a garage doesn't keep presenting an old count as
// current.
export function DataFreshness({
  parking,
  serverNow,
}: {
  parking: Parking;
  serverNow: number;
}) {
  const t = useTranslations("freshness");
  const formatAge = useFormatAge();
  const now = useNow(serverNow);
  const age = dataAgeMs(parking, now);
  if (!parking.hasLiveData || age === null) return null;
  if (isStale(parking, now)) {
    return <StaleDataWarning ageMs={age} size="md" className="mt-2" />;
  }
  return (
    <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="size-3" aria-hidden />
      {t("updated", { age: formatAge(age) })}
    </p>
  );
}
