import { Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/tariffs";
import { cn } from "@/lib/utils";

// What a card needs to show the price of the visitor's chosen stay.
export type StayPriceInfo = {
  // Euro cents; null when unknown.
  cost: number | null;
  minutes: number;
  showUnknown: boolean;
};

// "€6.00 for 2 hours" on a card or in the list: what the chosen stay costs
// here, from the rate table (lib/tariffs.ts). An unknown price shows nothing,
// or with `showUnknown` says so, never a number.
export function StayPrice({
  cost,
  minutes,
  showUnknown = false,
  short = false,
  className,
}: {
  // Euro cents; null or undefined when unknown.
  cost: number | null | undefined;
  minutes: number;
  showUnknown?: boolean;
  // Just the amount, for a table column that already names the stay.
  short?: boolean;
  className?: string;
}) {
  const t = useTranslations("tariffs");
  const tFacilities = useTranslations("facilities");
  const locale = useLocale();
  const hours = minutes / 60;
  if (cost === null || cost === undefined) {
    if (!showUnknown) return null;
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        {short ? "—" : t("unknown")}
      </span>
    );
  }
  const price = formatEuro(cost, locale);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        cost === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-foreground/90",
        className,
      )}
    >
      {short ? null : <Tag className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
      {short
        ? cost === 0
          ? tFacilities("free")
          : price
        : cost === 0
          ? t("freeFor", { hours })
          : t("costFor", { price, hours })}
    </span>
  );
}
