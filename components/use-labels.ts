import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ageParts } from "@/lib/freshness";
import { formatDistance, walkingMinutes } from "@/lib/geo";
import type { Parking } from "@/lib/parkings.schema";

// Small translation helpers shared by several components. They work in both
// server and client components.

// "3 min ago" / "3 min geleden" / "il y a 3 min" for a data age in ms.
export function useFormatAge(): (ms: number) => string {
  const t = useTranslations("freshness");
  return (ms) => {
    const age = ageParts(ms);
    switch (age.unit) {
      case "now":
        return t("ageNow");
      case "minutes":
        return t("ageMinutes", { count: age.count });
      case "hours":
        return t("ageHours", { count: age.count });
      case "days":
        return t("ageDays", { count: age.count });
    }
  };
}

// "14:05" in every language: Belgium uses the 24-hour clock, also when the
// site is read in English. Ghent time (the time zone is set globally).
export function useFormatTime(): (timestamp: number) => string {
  const format = useFormatter();
  return (timestamp) =>
    format.dateTime(timestamp, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
}

// "350 m", or with `walking` (the distance is to where the visitor is
// heading, so they will cover it on foot) "350 m · ~6 min walk".
export function useFormatDistance(): (km: number, walking?: boolean) => string {
  const locale = useLocale();
  const t = useTranslations("destination");
  return (km, walking = false) => {
    const distance = formatDistance(km, locale);
    return walking
      ? `${distance} · ${t("walk", { minutes: walkingMinutes(km) })}`
      : distance;
  };
}

// The feed describes a garage's type and low-emission-zone status with raw
// codes. Known ones are translated; anything new falls back to the feed's
// own wording rather than showing nothing.
export function useParkingLabels() {
  const t = useTranslations("common");
  return {
    type(p: Pick<Parking, "type" | "typeLabel">): string {
      const key = `types.${p.type}`;
      return /^[A-Za-z]+$/.test(p.type) && t.has(key) ? t(key) : p.typeLabel;
    },
    lez(p: Pick<Parking, "category" | "categoryLabel" | "isInsideLez">): string {
      if (p.isInsideLez) return t("insideLez");
      if (p.category.toLowerCase().includes("buiten")) return t("outsideLez");
      return p.categoryLabel;
    },
    status(p: Pick<Parking, "isOpen">): string {
      return p.isOpen ? t("open") : t("closed");
    },
  };
}
