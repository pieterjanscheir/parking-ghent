"use client";

import { useSearchParams } from "next/navigation";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_INFO, routing, type Locale } from "@/i18n/routing";

// Language menu in the header. Switching keeps the visitor on the same page,
// with the same search, sort, filters and destination. The closed menu shows
// the short code ("NL") to save room; the list shows each language's own name.
export function LanguageSwitcher() {
  const t = useTranslations("header");
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const query = Object.fromEntries(useSearchParams());

  return (
    <Select
      value={current}
      onValueChange={(next) =>
        router.replace({ pathname, query }, { locale: next as Locale, scroll: false })
      }
    >
      <SelectTrigger
        size="sm"
        aria-label={t("language")}
        className="gap-1.5 text-xs font-medium uppercase tracking-wide"
      >
        <Languages className="size-3.5 text-muted-foreground" aria-hidden />
        <SelectValue>{current}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {routing.locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            <span lang={locale}>{LOCALE_INFO[locale].name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
