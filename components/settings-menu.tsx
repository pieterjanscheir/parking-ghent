"use client";

import { Download, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMapProvider, type MapProvider } from "@/lib/map-provider";
import { useInstallPrompt } from "@/lib/use-install-prompt";
import { cn } from "@/lib/utils";

const PROVIDERS: { value: MapProvider; nameKey: string; noteKey: string }[] = [
  { value: "osm", nameKey: "osm", noteKey: "osmNote" },
  { value: "google", nameKey: "google", noteKey: "googleNote" },
];

// The gear menu in the header. Choices are remembered in this browser only.
export function SettingsMenu() {
  const t = useTranslations("settings");
  const { provider, setProvider } = useMapProvider();
  const { state: installState, install } = useInstallPrompt();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("open")}
          className="text-muted-foreground hover:text-foreground"
        >
          <Settings aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-4">
        <p className="font-heading text-sm font-semibold">{t("title")}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("mapTitle")}
          </legend>
          {PROVIDERS.map((option) => {
            const checked = provider === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
                  checked
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/60 hover:bg-muted/60",
                )}
              >
                <input
                  type="radio"
                  name="map-provider"
                  value={option.value}
                  checked={checked}
                  onChange={() => setProvider(option.value)}
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{t(option.nameKey)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(option.noteKey)}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {installState !== "none" ? (
          <div className="border-t border-border/60 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("appTitle")}
            </p>
            {installState === "available" ? (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={install}>
                <Download className="size-3.5" aria-hidden />
                {t("install")}
              </Button>
            ) : (
              <p className="text-sm">{t("installIos")}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t("installNote")}</p>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
