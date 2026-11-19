"use client";

import { Download, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMapProvider, type MapProvider } from "@/lib/map-provider";
import { useInstallPrompt } from "@/lib/use-install-prompt";
import { THEMES, type ThemeChoice } from "./theme-provider";
import { cn } from "@/lib/utils";

const PROVIDERS: { value: MapProvider; nameKey: string; noteKey: string }[] = [
  { value: "osm", nameKey: "osm", noteKey: "osmNote" },
  { value: "google", nameKey: "google", noteKey: "googleNote" },
];

const THEME_ICON: Record<ThemeChoice, typeof Sun> = { dark: Moon, light: Sun, system: Monitor };

// The gear menu in the header. Choices are remembered in this browser only.
export function SettingsMenu() {
  const t = useTranslations("settings");
  const { provider, setProvider } = useMapProvider();
  const { state: installState, install } = useInstallPrompt();
  // Undefined until the page is live in the browser: the stored choice isn't
  // known on the server.
  const { theme, setTheme } = useTheme();

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
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("themeTitle")}
          </legend>
          <div className="grid grid-cols-3 gap-1.5">
            {THEMES.map((option) => {
              const Icon = THEME_ICON[option];
              const checked = theme === option;
              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    checked
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option}
                    checked={checked}
                    onChange={() => setTheme(option)}
                    className="sr-only"
                  />
                  <Icon className="size-4" aria-hidden />
                  {t(`theme.${option}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
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
