import { Bus, Info, Tag, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { localizedNote, type LocalizedNote } from "@/lib/directory";
import { tariffFor } from "@/lib/tariffs";
import { TariffDetails } from "./tariff-details";

type Props = {
  parkAndRide: boolean;
  isFree: boolean | null;
  evChargers: number;
  evMaxKw: number | null;
  note: LocalizedNote | null;
  // The car park's id, to look up its rates (lib/tariffs.ts).
  tariffId?: string;
};

const TERM =
  "inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

// The practical facts on a car park's page: price (the operator's rates
// where we have them, else free or paid when known), Park & Ride, charging,
// and the city's own remark. Renders nothing when there are none.
export function ParkingFacilities({ parkAndRide, isFree, evChargers, evMaxKw, note, tariffId }: Props) {
  const t = useTranslations("facilities");
  const tTariffs = useTranslations("tariffs");
  const locale = useLocale();
  const remark = localizedNote(note, locale);
  const tariff = tariffId ? tariffFor(tariffId) : null;
  if (!tariff && !parkAndRide && isFree === null && evChargers === 0 && !remark) return null;
  return (
    <dl className="mt-8 grid gap-5 sm:grid-cols-2">
      {tariff ? (
        <div className="sm:col-span-2">
          <dt className={TERM}>
            <Tag className="size-3.5" aria-hidden /> {tTariffs("ratesTitle")}
          </dt>
          <dd className="mt-2">
            <TariffDetails entry={tariff} />
          </dd>
        </div>
      ) : isFree !== null ? (
        <div>
          <dt className={TERM}>
            <Tag className="size-3.5" aria-hidden /> {t("priceLabel")}
          </dt>
          <dd className="mt-1 text-sm">{isFree ? t("freeParking") : t("paid")}</dd>
        </div>
      ) : null}
      {parkAndRide ? (
        <div>
          <dt className={TERM}>
            <Bus className="size-3.5" aria-hidden /> {t("parkAndRide")}
          </dt>
          <dd className="mt-1 text-sm">{t("parkAndRideDetail")}</dd>
        </div>
      ) : null}
      {evChargers > 0 ? (
        <div>
          <dt className={TERM}>
            <Zap className="size-3.5" aria-hidden /> {t("chargingLabel")}
          </dt>
          <dd className="mt-1 text-sm">
            {evMaxKw !== null
              ? t("chargePointsKw", { count: evChargers, kw: evMaxKw })
              : t("chargePoints", { count: evChargers })}
          </dd>
        </div>
      ) : null}
      {remark ? (
        <div className="sm:col-span-2">
          <dt className={TERM}>
            <Info className="size-3.5" aria-hidden /> {t("cityNote")}
          </dt>
          {/* The city writes these in Dutch, and often in English and French. */}
          <dd className="mt-1 text-sm" lang={remark.lang}>
            {remark.text}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">{t("cityNoteSource")}</dd>
        </div>
      ) : null}
    </dl>
  );
}
