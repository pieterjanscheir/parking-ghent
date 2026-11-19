import { useLocale, useTranslations } from "next-intl";
import { ageParts } from "@/lib/freshness";
import { formatDistance } from "@/lib/geo";
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

export function useFormatDistance(): (km: number) => string {
  const locale = useLocale();
  return (km) => formatDistance(km, locale);
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
