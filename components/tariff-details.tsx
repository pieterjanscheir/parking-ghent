import { ExternalLink } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  RATE_ROWS,
  bandStayCost,
  formatEuro,
  rateColumns,
  weekdayRuns,
  type RateColumn,
  type PaidTariff,
  type TariffEntry,
} from "@/lib/tariffs";

const pad = (n: number) => String(n).padStart(2, "0");

// The rates of one car park, as its operator publishes them: what a stay
// costs in each band, the daily maximum, and where and when they were read.
// Works in server and client components.
export function TariffDetails({ entry }: { entry: TariffEntry }) {
  const t = useTranslations("tariffs");
  const format = useFormatter();
  const locale = useLocale();
  const { tariff } = entry;
  const [year, month, day] = entry.checkedOn.split("-").map(Number);
  const checkedOn = format.dateTime(new Date(Date.UTC(year, month - 1, day)), {
    dateStyle: "long",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-3 text-sm">
      {tariff.kind === "free" ? (
        <p>
          {tariff.maxMinutes !== undefined
            ? t("freeUpTo", { hours: tariff.maxMinutes / 60 })
            : t("freeAlways")}
        </p>
      ) : (
        <PaidRates tariff={tariff} locale={locale} />
      )}
      {entry.notes.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
          {entry.notes.map((note) => (
            <li key={note}>{t(`notes.${note}`)}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("source", { operator: entry.operator, date: checkedOn })}{" "}
        <a
          href={entry.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("sourceLink")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
      {tariff.kind === "paid" ? <p className="text-xs text-muted-foreground">{t("estimate")}</p> : null}
    </div>
  );
}

function PaidRates({ tariff, locale }: { tariff: PaidTariff; locale: string }) {
  const t = useTranslations("tariffs");
  const format = useFormatter();
  const columns = rateColumns(tariff);
  const schedule = tariff.schedule;
  const from = schedule.kind === "day-night" ? `${pad(schedule.dayStartHour)}:00` : "";
  const to = schedule.kind === "day-night" ? `${pad(schedule.dayEndHour)}:00` : "";
  // 15 November 2026 was a Sunday: weekday 0.
  const weekdayName = (weekday: number) =>
    format.dateTime(new Date(Date.UTC(2026, 10, 15 + weekday)), { weekday: "short", timeZone: "UTC" });
  const days = (weekdays: number[]) =>
    weekdayRuns(weekdays)
      .map(([first, last]) => (first === last ? weekdayName(first) : `${weekdayName(first)}–${weekdayName(last)}`))
      .join(", ");
  const label = (column: RateColumn) => {
    switch (column.period) {
      case "always":
        return t("columnAlways");
      case "night":
        return t("columnNight", { from: to, to: from });
      case "day":
        return column.holidays
          ? t("columnDaysHolidays", { days: days(column.weekdays), from, to })
          : t("columnDays", { days: days(column.weekdays), from, to });
    }
  };
  const slice = Object.values(tariff.bands)[0].sliceMinutes;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("stay")}
              </th>
              {columns.map((column) => (
                <th key={`${column.period}-${column.band}`} scope="col" className="px-3 py-2 font-medium">
                  {label(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RATE_ROWS.map((minutes) => (
              <tr key={minutes} className="border-t border-border/50">
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-normal text-muted-foreground">
                  {minutes < 60 ? t("rowMinutes", { minutes }) : t("rowHours", { hours: minutes / 60 })}
                </th>
                {columns.map((column) => (
                  <td key={`${column.period}-${column.band}`} className="px-3 py-1.5 tabular-nums">
                    {formatEuro(bandStayCost(tariff, column.band, minutes), locale)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("slices", { minutes: slice })}{" "}
        {tariff.graceMinutes > 0 ? `${t("grace", { minutes: tariff.graceMinutes })} ` : null}
        {t("dailyMax", { price: formatEuro(tariff.dailyCap, locale) })}
      </p>
    </>
  );
}
