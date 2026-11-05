import { Clock } from "lucide-react";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import { cn } from "@/lib/utils";

type Hint = { text: string; tone: "warn" | "good" | "neutral" };

// One-line answer to "will there still be space when I get there?".
export function forecastHint(parking: Parking, trend: Trend | null): Hint | null {
  if (!trend || !parking.hasLiveData || !parking.isOpen) return null;
  const f = trend.forecast;
  if (f.minutesUntilFull !== null) {
    return { text: `Likely full in ~${f.minutesUntilFull} min`, tone: "warn" };
  }
  // The trend was rejected for this garage: don't imply it's stable.
  if (f.method === "persistence") {
    return { text: "Hard to predict right now", tone: "neutral" };
  }
  if (trend.direction === "steady") {
    return { text: `Stable for the next ${f.horizonMinutes} min`, tone: "neutral" };
  }
  return {
    text: `~${f.predictedFreeSpaces} free in ${f.horizonMinutes} min`,
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
  const hint = forecastHint(parking, trend);
  if (!hint) return null;
  return (
    <p className={cn("inline-flex items-center gap-1 text-xs", TONE[hint.tone], className)}>
      <Clock className="size-3 shrink-0" aria-hidden />
      {hint.text}
    </p>
  );
}
