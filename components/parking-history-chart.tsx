"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryPoint, Trend } from "@/lib/parking-history";
import { cn } from "@/lib/utils";

type Props = {
  points: HistoryPoint[];
  trend: Trend | null;
  totalSpaces: number;
};

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatTime(ts: number): string {
  return TIME_FMT.format(new Date(ts));
}

function trendLabel(trend: Trend): {
  label: string;
  detail: string;
  Icon: typeof TrendingUp;
  tone: "rising" | "falling" | "steady";
} {
  const abs = Math.abs(trend.slopePerHour);
  if (trend.direction === "rising") {
    return {
      label: "Filling up",
      detail: `+${abs.toFixed(1)}pp/h occupied · ${trend.freeSpacesDelta} free in last ${trend.windowMinutes}m`,
      Icon: TrendingUp,
      tone: "rising",
    };
  }
  if (trend.direction === "falling") {
    return {
      label: "Emptying out",
      detail: `−${abs.toFixed(1)}pp/h occupied · +${Math.abs(trend.freeSpacesDelta)} free in last ${trend.windowMinutes}m`,
      Icon: TrendingDown,
      tone: "falling",
    };
  }
  return {
    label: "Steady",
    detail: `${trend.freeSpacesDelta >= 0 ? "+" : ""}${trend.freeSpacesDelta} free in last ${trend.windowMinutes}m`,
    Icon: Minus,
    tone: "steady",
  };
}

const TONE_CLASS: Record<"rising" | "falling" | "steady", string> = {
  // Fewer free spaces is "bad" → use the destructive tone.
  rising:
    "border-destructive/40 bg-destructive/10 text-destructive-foreground",
  falling:
    "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  steady:
    "border-border/60 bg-muted/40 text-muted-foreground",
};

export function ParkingHistoryChart({ points, trend, totalSpaces }: Props) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No history data available yet.
      </p>
    );
  }

  const data = points.map((p) => ({
    t: p.timestamp,
    free: p.freeSpaces,
    occupiedPercent: p.occupiedPercent,
  }));
  const firstTs = points[0].timestamp;
  const lastTs = points[points.length - 1].timestamp;
  const minutesSpan = Math.round((lastTs - firstTs) / 60_000);

  const minFree = Math.min(...points.map((p) => p.freeSpaces));
  const maxFree = Math.max(...points.map((p) => p.freeSpaces));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Recent occupancy
          </h2>
          <p className="text-xs text-muted-foreground">
            {points.length} samples · last {minutesSpan} min ·{" "}
            {formatTime(firstTs)} → {formatTime(lastTs)}
          </p>
        </div>
        {trend ? <TrendBadge trend={trend} /> : null}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
          >
            <defs>
              <linearGradient id="freeFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.55}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTime}
              minTickGap={48}
              stroke="var(--color-muted-foreground)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              dataKey="free"
              domain={[0, totalSpaces]}
              stroke="var(--color-muted-foreground)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              content={<HistoryTooltip totalSpaces={totalSpaces} />}
              cursor={{ stroke: "var(--color-border)" }}
            />
            <ReferenceLine
              y={totalSpaces}
              stroke="var(--color-border)"
              strokeDasharray="2 4"
            />
            <Area
              type="monotone"
              dataKey="free"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#freeFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
        <Stat label="Min free" value={minFree} />
        <Stat label="Max free" value={maxFree} />
        <Stat label="Capacity" value={totalSpaces} />
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  const { label, detail, Icon, tone } = trendLabel(trend);
  return (
    <div
      className={cn(
        "inline-flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        TONE_CLASS[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="leading-tight">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-[11px] opacity-80">{detail}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-heading text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

type TooltipPayload = {
  payload: { t: number; free: number; occupiedPercent: number };
};

function HistoryTooltip({
  active,
  payload,
  totalSpaces,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  totalSpaces: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border/70 bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">{formatTime(p.t)}</div>
      <div className="mt-0.5 text-muted-foreground tabular-nums">
        {p.free} / {totalSpaces} free · {Math.round(p.occupiedPercent)}% full
      </div>
    </div>
  );
}
