import { Suspense } from "react";
import { CircleParking } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { LiveDataLabel } from "./live-data-label";
import { ParkedLink } from "./parked-link";
import { SettingsMenu } from "./settings-menu";

export function SiteHeader() {
  const t = useTranslations("header");
  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5"
          aria-label={t("home")}
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25 transition-all group-hover:bg-primary/25 group-hover:ring-primary/40">
            <CircleParking className="size-4 text-primary" />
          </span>
          <span className="font-heading text-sm font-semibold tracking-tight">
            Ghent Parking
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <LiveDataLabel />
          {/* Reads the URL's search params, which needs a Suspense boundary
              on pages that are rendered ahead of time. */}
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <ParkedLink />
          <SettingsMenu />
        </div>
      </div>
    </header>
  );
}
