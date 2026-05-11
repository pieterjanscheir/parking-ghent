"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
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

const LABEL: Record<Trend["direction"], string> = {
  rising: "Filling up",
  falling: "Emptying out",
  steady: "Holding steady",
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
function tooltipDetail(trend: Trend, currentFree: number): string {
  const f = trend.forecast;
  const horizon = f.horizonMinutes;
  if (trend.direction === "steady") {
    return `No clear change in the next ${horizon} min`;
  }
  const delta = f.predictedFreeSpaces - currentFree;
  const abs = Math.abs(delta);
  if (abs === 0) {
    // Significant slope but forecast hit a boundary (e.g. 0% or 100% clamp).
    return trend.direction === "rising"
      ? `Slowly filling up over the next ${horizon} min`
      : `Slowly emptying over the next ${horizon} min`;
  }
  const word = abs === 1 ? "space" : "spaces";
  return delta < 0
    ? `About ${abs} fewer ${word} in the next ${horizon} min`
    : `About ${abs} more ${word} in the next ${horizon} min`;
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
  const Icon = ICON[trend.direction];
  const label = LABEL[trend.direction];
  const detail = tooltipDetail(trend, currentFree);

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
