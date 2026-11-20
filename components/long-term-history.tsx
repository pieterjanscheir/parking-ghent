"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  DAYTIME,
  ENOUGH_DAYS,
  READING_MINUTES,
  chartDays,
  completeDays,
  ghentDay,
  rangeFacts,
  type ChartDay,
} from "@/lib/history-summary";
import { useGarageDays } from "@/lib/use-garage-days";
import { useDeviceNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "weeks", days: 28 },
  { key: "months", days: 91 },
  { key: "year", days: 365 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

type Translate = ReturnType<typeof useTranslations>;

// "How full was this garage, day by day" on a garage's page: the busiest
// moment of every day as a bar and the daytime average as a line, over four
// weeks, three months or a year, from this site's own measurements
// (lib/history-summary.ts). Renders nothing for a garage that was never
// measured, and says so plainly while there is less than a week to show.
export function LongTermHistory({ garageId }: { garageId: string }) {
  const t = useTranslations("longTerm");
  const locale = useLocale();
  const garage = useGarageDays(garageId);
  const now = useDeviceNow();
  const [range, setRange] = useState<RangeKey>("weeks");

  if (!garage || now === 0) return null;

  const dateFormat = (options: Intl.DateTimeFormatOptions) => {
    const format = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    return (date: string) => format.format(noon(date));
  };
  const longDate = dateFormat({ day: "numeric", month: "long", year: "numeric" });
  const since = longDate(garage.from);
  const complete = completeDays(garage.days);

  return (
    <section
      aria-labelledby="long-term-heading"
      className="mt-6 surface-card rounded-xl border border-border/70 p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="long-term-heading" className="font-heading text-lg font-semibold tracking-tight">
          {t("title")}
        </h2>
        {complete >= ENOUGH_DAYS ? (
          <div role="group" aria-label={t("pickRange")} className="flex gap-1">
            {RANGES.map(({ key }) => (
              <button
                key={key}
                type="button"
                aria-pressed={key === range}
                onClick={() => setRange(key)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  key === range
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {t(`ranges.${key}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {complete < ENOUGH_DAYS ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("notEnough", { since, count: complete, needed: ENOUGH_DAYS })}
        </p>
      ) : (
        <>
          <Chart
            days={chartDays(garage.days, ghentDay(now).date, RANGES.find((r) => r.key === range)!.days)}
            from={garage.from}
            t={t}
            shortDate={dateFormat({ day: "numeric", month: "short" })}
            longDate={dateFormat({ weekday: "short", day: "numeric", month: "long", year: "numeric" })}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            {t("source", { since, from: clock(DAYTIME.from * 60), to: clock(((DAYTIME.to + 1) % 24) * 60) })}
          </p>
        </>
      )}
    </section>
  );
}

function Chart({
  days: allDays,
  from,
  t,
  shortDate,
  longDate,
}: {
  days: ChartDay[];
  from: string;
  t: Translate;
  shortDate: (date: string) => string;
  longDate: (date: string) => string;
}) {
  // Nothing before the first measurement: the chart starts where the
  // archive does, and grows to the full range as the weeks pass.
  const days = allDays.filter((day) => day.date >= from);
  const facts = rangeFacts(days);
  const hasPartial = days.some((day) => day.partial);

  return (
    <>
      <div className="mt-3 space-y-1 text-sm">
        {facts.busiest?.stats ? (
          <p>
            {t("busiestDay", {
              date: longDate(facts.busiest.date),
              percent: facts.busiest.peak ?? 0,
              time: clock(facts.busiest.stats[3]),
            })}
          </p>
        ) : null}
        <p className="text-muted-foreground">
          {t("fullDays", { full: facts.fullDays, count: facts.complete })}
          {facts.average !== null ? ` ${t("averageAll", { percent: facts.average })}` : ""}
        </p>
      </div>

      <div aria-hidden className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-[var(--color-chart-1)]" />
          {t("legendPeak")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded-full bg-[var(--color-chart-3)]" />
          {t("legendAverage")}
        </span>
        {hasPartial ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-[var(--color-chart-1)] opacity-30" />
            {t("legendPartial")}
          </span>
        ) : null}
      </div>

      <div aria-hidden className="mt-2 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap={days.length > 120 ? 0 : 1}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              minTickGap={32}
              stroke="var(--color-muted-foreground)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value: number) => `${value}%`}
              stroke="var(--color-muted-foreground)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              content={<DayTooltip t={t} longDate={longDate} />}
              cursor={{ fill: "var(--color-muted)", fillOpacity: 0.4 }}
            />
            <Bar dataKey="peak" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {days.map((day) => (
                <Cell
                  key={day.date}
                  fill="var(--color-chart-1)"
                  fillOpacity={day.partial ? 0.3 : 0.85}
                />
              ))}
            </Bar>
            <Line
              dataKey="average"
              stroke="var(--color-chart-3)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* The same days in words. In a hidden div: a table ignores the 1px
          width of sr-only and would widen the page on a phone. */}
      <div className="sr-only">
        <table>
          <caption>{t("title")}</caption>
          <thead>
            <tr>
              <th>{t("tableDate")}</th>
              <th>{t("legendPeak")}</th>
              <th>{t("legendAverage")}</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((day) => day.stats)
              .map((day) => (
                <tr key={day.date}>
                  <td>
                    {longDate(day.date)}
                    {day.partial ? ` (${t("partial")})` : ""}
                  </td>
                  <td>{t("percentAt", { percent: day.peak ?? 0, time: clock(day.stats![3]) })}</td>
                  <td>{day.average === null ? "–" : `${day.average}%`}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DayTooltip({
  active,
  payload,
  t,
  longDate,
}: {
  active?: boolean;
  payload?: { payload: ChartDay }[];
  t: Translate;
  longDate: (date: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const day = payload[0].payload;
  const stats = day.stats;
  const fullMinutes = stats ? stats[5] * READING_MINUTES : 0;
  return (
    <div className="max-w-64 rounded-md border border-border/70 bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">{longDate(day.date)}</div>
      {stats ? (
        <div className="mt-0.5 space-y-0.5 text-muted-foreground tabular-nums">
          <div>
            {t("tooltipPeak", { percent: day.peak ?? 0, time: clock(stats[3]), free: stats[2], total: stats[1] })}
          </div>
          {day.average !== null ? <div>{t("tooltipAverage", { percent: day.average })}</div> : null}
          {fullMinutes > 0 ? (
            <div>
              {t("tooltipFull", { hours: Math.floor(fullMinutes / 60), minutes: fullMinutes % 60 })}
            </div>
          ) : null}
          <div>
            {t("tooltipReadings", { count: stats[0] })}
            {day.partial ? ` · ${t("partial")}` : ""}
          </div>
        </div>
      ) : (
        <div className="mt-0.5 text-muted-foreground">{t("noReadings")}</div>
      )}
    </div>
  );
}
