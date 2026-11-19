import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = {
  parkAndRide: boolean;
  // null: unknown, shown as nothing.
  isFree: boolean | null;
  evChargers: number;
  className?: string;
};

const BADGE = "inline-flex items-center gap-1 rounded-4xl border px-2 py-0.5 text-xs font-medium";

// What sets a car park apart at a glance: Park & Ride, free of charge,
// charge points for electric cars. Renders nothing when none apply.
export function FacilityBadges({ parkAndRide, isFree, evChargers, className }: Props) {
  const t = useTranslations("facilities");
  if (!parkAndRide && isFree !== true && evChargers === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {parkAndRide ? (
        <span
          className={cn(BADGE, "border-sky-400/30 bg-sky-400/10 text-sky-300")}
          title={t("parkAndRideDetail")}
        >
          <abbr title={t("parkAndRide")} className="no-underline">
            {t("parkAndRideShort")}
          </abbr>
        </span>
      ) : null}
      {isFree === true ? (
        <span className={cn(BADGE, "border-emerald-400/30 bg-emerald-400/10 text-emerald-300")}>
          {t("free")}
        </span>
      ) : null}
      {evChargers > 0 ? (
        <span
          className={cn(BADGE, "border-amber-300/30 bg-amber-300/10 text-amber-200")}
          title={t("chargePoints", { count: evChargers })}
        >
          <Zap className="size-3" aria-hidden />
          <span className="sr-only">{t("evCharging")}: </span>
          {evChargers}
        </span>
      ) : null}
    </span>
  );
}
