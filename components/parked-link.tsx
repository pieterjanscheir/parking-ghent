"use client";

import { CarFront } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isCurrent, useParkedSpot } from "@/lib/parked";
import { useDeviceNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

// The car in the header: to "Where did I park?". Lit up while a spot is
// saved, so it is clear at a glance that the app remembers one.
export function ParkedLink() {
  const t = useTranslations("header");
  const now = useDeviceNow();
  const { spot, ready } = useParkedSpot();
  const saved = ready && now > 0 && spot !== null && isCurrent(spot, now);
  return (
    <Link
      href="/parked"
      aria-label={t("parked")}
      title={t("parked")}
      className={cn(
        "relative flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        saved ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <CarFront className="size-4" aria-hidden />
      {saved ? (
        <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
      ) : null}
    </Link>
  );
}
