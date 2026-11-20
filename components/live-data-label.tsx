"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";

// "Live data · Stad Gent" in the header. True for Ghent's pages only: the
// pages of the other cities name their own source, and some have no live
// data at all.
export function LiveDataLabel() {
  const t = useTranslations("header");
  const pathname = usePathname();
  if (pathname.startsWith("/cities")) return null;
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
      <span className="size-1.5 motion-safe:animate-pulse rounded-full bg-emerald-400" aria-hidden />
      {t("liveData")}
    </span>
  );
}
