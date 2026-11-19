"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Trend } from "@/lib/parking-history";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

type Props = {
  trend: Trend;
  currentFree: number;
  size?: Size;
  className?: string;
};

const ICON: Record<Trend["direction"], typeof TrendingUp> = {
  rising: TrendingUp,
  falling: TrendingDown,
  steady: Minus,
};

const TONE: Record<Trend["direction"], string> = {
  rising: "text-destructive border-destructive/40 bg-destructive/10",
  falling: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  steady: "text-muted-foreground border-border/60 bg-muted/40",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "size-5 [&_svg]:size-3",
  md: "size-6 [&_svg]:size-3.5",
};

// Describe the change only — never the absolute future count. The card next
// to this tooltip already shows "now"; putting another absolute number here
// makes the two compete in the reader's head ("wait, is it 249 or 233?").
// Returns a key in the "forecast" messages plus its placeholder values.
function tooltipDetail(
  trend: Trend,
  currentFree: number,
): { key: string; values?: Record<string, number> } {
  const f = trend.forecast;
  const minutes = f.horizonMinutes;
  if (f.method === "persistence") return { key: "tipUnpredictable" };
  if (f.minutesUntilFull !== null) {
    return { key: "tipFullIn", values: { minutes: f.minutesUntilFull } };
  }
  if (trend.direction === "steady") {
    return { key: "tipNoChange", values: { minutes } };
  }
  const delta = f.predictedFreeSpaces - currentFree;
  return {
    key: delta < 0 ? "tipFewer" : "tipMore",
    values: { count: Math.abs(delta), minutes },
  };
}

// Compact icon-only trend chip for use on cards / list rows. Reuses the same
// underlying Trend model as the detail-page chart; the tooltip shows just
// enough so people don't have to click through for a one-line answer.
export function TrendIndicator({
  trend,
  currentFree,
  size = "sm",
  className,
}: Props) {
  const t = useTranslations("forecast");
  const Icon = ICON[trend.direction];
  const label = t(trend.direction);
  const tip = tooltipDetail(trend, currentFree);
  const detail = t(tip.key, tip.values);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            // Stop clicks bubbling into a parent <Link>: tapping the chip
            // shouldn't navigate to the detail page on mobile (where tap = hover).
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            role="img"
            aria-label={`${label}. ${detail}`}
            className={cn(
              "inline-flex items-center justify-center rounded-full border",
              SIZE_CLASS[size],
              TONE[trend.direction],
              className,
            )}
          >
            <Icon aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <div className="text-xs">
            <div className="font-medium">{label}</div>
            <div className="opacity-80">{detail}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
