"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_LABELS, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// NL · EN · FR links that keep the visitor on the same page, with the same
// search, sort and filters, in another language.
export function LanguageSwitcher() {
  const t = useTranslations("header");
  const current = useLocale();
  const pathname = usePathname();
  const query = Object.fromEntries(useSearchParams());

  return (
    <nav aria-label={t("language")} className="flex items-center gap-0.5">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={{ pathname, query }}
          locale={locale}
          hrefLang={locale}
          lang={locale}
          title={LOCALE_LABELS[locale]}
          aria-label={LOCALE_LABELS[locale]}
          aria-current={locale === current ? "true" : undefined}
          className={cn(
            "rounded-md px-1.5 py-1 text-xs font-medium uppercase tracking-wide transition-colors",
            locale === current
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
