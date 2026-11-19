import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Suggestion } from "@/lib/recommend";
import { ParkingActions } from "./parking-actions";
import { useFormatDistance } from "./use-labels";

type Props = {
  // Where the distances are measured from: the destination's name, or null
  // for the visitor's own location.
  place: string | null;
  suggestion: Suggestion | null;
  parkAndRide: { id: string; name: string; km: number } | null;
};

// The short answer above the list: which garage to take, and why not the
// nearest one when that isn't it.
export function DestinationAdvice({ place, suggestion, parkAndRide }: Props) {
  const t = useTranslations("advice");
  const formatDistance = useFormatDistance();
  const walking = place !== null;
  const passed = suggestion?.passedOver ?? null;

  return (
    <section
      aria-label={place ? t("titleFor", { place }) : t("titleNearYou")}
      className="mt-4 rounded-xl border border-primary/40 bg-primary/[0.05] p-4"
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
        <Sparkles className="size-3.5" aria-hidden />
        {place ? t("titleFor", { place }) : t("titleNearYou")}
      </p>

      {suggestion ? (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <Link
                href={`/parkings/${encodeURIComponent(suggestion.best.id)}`}
                className="font-heading text-xl font-bold tracking-tight underline-offset-4 hover:underline"
              >
                {suggestion.best.name}
              </Link>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatDistance(suggestion.bestKm, walking)} ·{" "}
                <span className="text-foreground">
                  {t("free", { count: suggestion.best.freeSpaces })}
                </span>
              </p>
            </div>
            <ParkingActions parking={suggestion.best} variant="compact" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {passed
              ? passed.reason === "almostFull"
                ? t("passed.almostFull", {
                    name: passed.parking.name,
                    count: passed.parking.freeSpaces,
                  })
                : passed.reason === "fillingUp"
                  ? t("passed.fillingUp", {
                      name: passed.parking.name,
                      minutes: passed.minutesUntilFull ?? 30,
                    })
                  : t(`passed.${passed.reason}`, { name: passed.parking.name })
              : t("nearestToo")}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("none")}</p>
      )}

      {parkAndRide ? (
        <p className="mt-2 border-t border-primary/15 pt-2 text-xs text-muted-foreground">
          {t("parkAndRide")}{" "}
          <Link
            href={`/parkings/${encodeURIComponent(parkAndRide.id)}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {parkAndRide.name}
          </Link>{" "}
          ({formatDistance(parkAndRide.km)})
        </p>
      ) : null}
    </section>
  );
}
