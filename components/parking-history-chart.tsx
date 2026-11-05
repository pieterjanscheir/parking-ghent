"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  HistoryPoint,
  Trend,
  TrendConfidence,
} from "@/lib/parking-history";
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

const CONFIDENCE_LABEL: Record<TrendConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

type BadgeContent = {
  label: string;
  // Primary line — the actionable answer ("will I get a spot?").
  primary: string;
  // Secondary line — model details for anyone who wants them.
  secondary: string;
  Icon: typeof TrendingUp;
  tone: "rising" | "falling" | "steady";
};

function trendLabel(trend: Trend, currentFree: number): BadgeContent {
  const f = trend.forecast;
  const delta = f.predictedFreeSpaces - currentFree;
  const horizon = f.horizonMinutes;
  const [lo, hi] = f.freeSpacesBand;

  let primary: string;
  if (f.method === "persistence") {
    primary = `Too erratic to forecast · likely ${lo}–${hi} free in ${horizon} min`;
  } else if (f.minutesUntilFull !== null) {
    primary = `Likely full in ~${f.minutesUntilFull} min`;
  } else if (trend.direction === "steady") {
    primary = `In ${horizon} min: no clear change · likely ${lo}–${hi} free`;
  } else {
    const deltaPhrase =
      delta < 0
        ? `${Math.abs(delta)} fewer than now`
        : `${delta} more than now`;
    primary = `In ${horizon} min: ~${f.predictedFreeSpaces} free · ${deltaPhrase}`;
  }

  const acc = f.accuracy;
  const secondary =
    acc.backtestCount > 0 && Number.isFinite(acc.maeSpaces)
      ? f.method === "trend"
        ? `Off by ~${Math.round(acc.maeSpaces)} spaces on average at ${horizon} min over the last few hours (${Math.round(acc.skill * 100)}% better than assuming no change)`
        : `Following the trend did worse than assuming no change here recently`
      : "Not enough history yet to measure accuracy";

  if (trend.direction === "rising") {
    return { label: "Filling up", primary, secondary, Icon: TrendingUp, tone: "rising" };
  }
  if (trend.direction === "falling") {
    return { label: "Emptying out", primary, secondary, Icon: TrendingDown, tone: "falling" };
  }
  return { label: "Holding steady", primary, secondary, Icon: Minus, tone: "steady" };
}

const TONE_CLASS: Record<"rising" | "falling" | "steady", string> = {
  rising:
    "border-destructive/40 bg-destructive/10 text-destructive-foreground",
  falling: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  steady: "border-border/60 bg-muted/40 text-muted-foreground",
};

type Row = {
  t: number;
  // Historical free spaces (null on forecast rows).
  free: number | null;
  // Central forecast (null on history rows). Rendered as a dashed line.
  forecastFree: number | null;
  // Band drawn via two stacked Areas: an invisible offset = forecastBase,
  // and a visible Area of height forecastBandWidth = hi − lo on top.
  forecastBase: number | null;
  forecastBandWidth: number | null;
  // Carried through so the tooltip can show occupied-%.
  occupiedPercent?: number;
};

function buildRows(points: HistoryPoint[], trend: Trend | null): Row[] {
  const rows: Row[] = points.map((p) => ({
    t: p.timestamp,
    free: p.freeSpaces,
    forecastFree: null,
    forecastBase: null,
    forecastBandWidth: null,
    occupiedPercent: p.occupiedPercent,
  }));
  if (!trend) return rows;

  // Bridge row at the last historical timestamp — pins the forecast series to
  // the present so the dashed line connects to the solid area.
  const last = points[points.length - 1];
  rows[rows.length - 1] = {
    ...rows[rows.length - 1],
    forecastFree: last.freeSpaces,
    forecastBase: last.freeSpaces,
    forecastBandWidth: 0,
  };

  for (const f of trend.forecast.series) {
    // Skip the t=0 point (already covered by the bridge above) to avoid a
    // duplicate timestamp that confuses the time-scale axis.
    if (f.timestamp <= last.timestamp) continue;
    rows.push({
      t: f.timestamp,
      free: null,
      forecastFree: f.freeSpaces,
      forecastBase: f.freeLo,
      forecastBandWidth: Math.max(0, f.freeHi - f.freeLo),
    });
  }
  return rows;
}

export function ParkingHistoryChart({ points, trend, totalSpaces }: Props) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No history data available yet.
      </p>
    );
  }

  const data = buildRows(points, trend);
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
            {trend ? " · forecast next 60 min" : ""}
          </p>
        </div>
        {trend ? (
          <TrendBadge
            trend={trend}
            currentFree={points[points.length - 1].freeSpaces}
          />
        ) : null}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -4 }}
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
              <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.22}
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
            {/* Historical free spaces — solid area. */}
            <Area
              type="monotone"
              dataKey="free"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#freeFill)"
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* Stacked-area trick to draw the prediction band as a ribbon. */}
            <Area
              type="monotone"
              dataKey="forecastBase"
              stackId="band"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="forecastBandWidth"
              stackId="band"
              stroke="none"
              fill="url(#bandFill)"
              isAnimationActive={false}
              activeDot={false}
              connectNulls={false}
            />
            {/* Central forecast — dashed projection. */}
            <Line
              type="monotone"
              dataKey="forecastFree"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {trend ? (
              <ReferenceLine
                x={lastTs}
                stroke="var(--color-muted-foreground)"
                strokeOpacity={0.5}
                strokeDasharray="2 3"
                label={{
                  value: "now",
                  position: "insideTopRight",
                  fill: "var(--color-muted-foreground)",
                  fontSize: 10,
                }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {trend ? (
        <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
          {trend.forecast.horizons.map((h) => (
            <Stat
              key={h.minutes}
              label={`In ${h.minutes} min`}
              value={`~${h.freeSpaces}`}
              detail={h.freeLo === h.freeHi ? undefined : `${h.freeLo}–${h.freeHi}`}
            />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
        <Stat label="Min free" value={minFree} />
        <Stat label="Max free" value={maxFree} />
        <Stat label="Capacity" value={totalSpaces} />
      </div>
    </div>
  );
}

function TrendBadge({
  trend,
  currentFree,
}: {
  trend: Trend;
  currentFree: number;
}) {
  const { label, primary, secondary, Icon, tone } = trendLabel(trend, currentFree);
  return (
    <div
      className={cn(
        "inline-flex max-w-sm items-start gap-2 rounded-md border px-3 py-2 text-xs",
        TONE_CLASS[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-[10px] uppercase tracking-wide opacity-70">
            {CONFIDENCE_LABEL[trend.confidence]}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] font-medium text-foreground">
          {primary}
        </div>
        <div className="mt-0.5 text-[10px] opacity-65">{secondary}</div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-heading text-lg font-semibold tabular-nums">
        {value}
        {detail ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type TooltipPayload = { payload: Row };

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
  const isForecast = p.free === null && p.forecastFree !== null;
  if (isForecast && p.forecastFree !== null) {
    const lo = (p.forecastBase ?? 0);
    const hi = lo + (p.forecastBandWidth ?? 0);
    return (
      <div className="rounded-md border border-border/70 bg-popover px-3 py-2 text-xs shadow-md">
        <div className="font-medium text-foreground">
          {formatTime(p.t)} · forecast
        </div>
        <div className="mt-0.5 text-muted-foreground tabular-nums">
          ≈ {p.forecastFree} free (likely {lo}–{hi}) of {totalSpaces}
        </div>
      </div>
    );
  }
  if (p.free !== null) {
    return (
      <div className="rounded-md border border-border/70 bg-popover px-3 py-2 text-xs shadow-md">
        <div className="font-medium text-foreground">{formatTime(p.t)}</div>
        <div className="mt-0.5 text-muted-foreground tabular-nums">
          {p.free} / {totalSpaces} free ·{" "}
          {Math.round(p.occupiedPercent ?? 0)}% full
        </div>
      </div>
    );
  }
  return null;
}
