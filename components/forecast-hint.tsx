import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import { cn } from "@/lib/utils";

// `key` is a key in the "forecast" messages; `values` fills its placeholders.
type Hint = {
  key: "fullIn" | "hardToPredict" | "stable" | "freeIn";
  values?: Record<string, number>;
  tone: "warn" | "good" | "neutral";
};

// One-line answer to "will there still be space when I get there?".
export function forecastHint(parking: Parking, trend: Trend | null): Hint | null {
  if (!trend || !parking.hasLiveData || !parking.isOpen) return null;
  const f = trend.forecast;
  if (f.minutesUntilFull !== null) {
    return { key: "fullIn", values: { minutes: f.minutesUntilFull }, tone: "warn" };
  }
  // The trend was rejected for this garage: don't imply it's stable.
  if (f.method === "persistence") {
    return { key: "hardToPredict", tone: "neutral" };
  }
  if (trend.direction === "steady") {
    return { key: "stable", values: { minutes: f.horizonMinutes }, tone: "neutral" };
  }
  return {
    key: "freeIn",
    values: { count: f.predictedFreeSpaces, minutes: f.horizonMinutes },
    tone: trend.direction === "rising" ? "warn" : "good",
  };
}

const TONE: Record<Hint["tone"], string> = {
  warn: "text-amber-300",
  good: "text-emerald-300",
  neutral: "text-muted-foreground",
};

export function ForecastHint({
  parking,
  trend,
  className,
}: {
  parking: Parking;
  trend: Trend | null;
  className?: string;
}) {
  const t = useTranslations("forecast");
  const hint = forecastHint(parking, trend);
  if (!hint) return null;
  return (
    <p className={cn("inline-flex items-center gap-1 text-xs", TONE[hint.tone], className)}>
      <Clock className="size-3 shrink-0" aria-hidden />
      {t(hint.key, hint.values)}
    </p>
  );
}
