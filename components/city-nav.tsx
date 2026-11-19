import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CITY_IDS, type CityId } from "@/lib/cities/info";
import { cityPath } from "@/lib/cities/pages";
import { cn } from "@/lib/utils";

// The cities the site knows, as a row of links. Ghent first: it is the home
// page. On a phone the row scrolls sideways rather than wrapping.
export function CityNav({ current, className }: { current: CityId | null; className?: string }) {
  const t = useTranslations("cities");
  return (
    <nav aria-label={t("navLabel")} className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="flex w-max items-center gap-1.5 sm:w-auto sm:flex-wrap">
        {CITY_IDS.map((id) => {
          const active = id === current;
          return (
            <li key={id}>
              <Link
                href={cityPath(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center rounded-4xl border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {t(`names.${id}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
