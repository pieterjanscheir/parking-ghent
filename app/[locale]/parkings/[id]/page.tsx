import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  MapPin,
  Building2,
} from "lucide-react";
import {
  fetchParkingById,
  fetchParkingDetailById,
  serverClock,
} from "@/lib/parkings";
import {
  computeTrend,
  fetchParkingHistory,
  getHistoryDataset,
} from "@/lib/parking-history";

import { Link } from "@/i18n/navigation";
import {
  OG_LOCALES,
  SITE_NAME,
  languageAlternates,
  shareImage,
} from "@/lib/site";
import { ParkingLabel } from "@/components/parking-label";
import { AvailabilityGauge } from "@/components/availability-gauge";
import { DataFreshness } from "@/components/data-freshness";
import { FavoriteButton } from "@/components/favorite-button";
import { LiveDataWarning } from "@/components/live-data-warning";
import { ParkingActions } from "@/components/parking-actions";
import { ParkingHistorySection } from "@/components/parking-history-section";
import {
  ParkingStatusBadge,
  MetaBadge,
} from "@/components/parking-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// React's `cache()` dedupes within a single render if the chart is invoked
// more than once.
const getHistory = cache(fetchParkingHistory);

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const parking = await fetchParkingById(decodeURIComponent(id));
  // The root layout's title template appends " — Ghent Parking".
  if (!parking) return { title: t("garageFallbackTitle") };

  const title = t("garageTitle", { name: parking.name });
  // No live count here: share previews are cached for days, so a number
  // would be wrong by the time anyone sees it.
  const description = t("garageDescription", { name: parking.name });
  const path = `/parkings/${encodeURIComponent(parking.id)}`;
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: languageAlternates(path),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALES[locale],
      title: `${title} — ${SITE_NAME}`,
      description,
      url: `/${locale}${path}`,
      images: [shareImage(locale, `${SITE_NAME} — ${t("tagline")}`)],
    },
  };
}

export default async function ParkingDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("detail");
  const tCommon = await getTranslations("common");
  const detail = await fetchParkingDetailById(decodeURIComponent(id));
  if (!detail) notFound();
  const { parking } = detail;

  const mapSrc =
    parking.lat !== null && parking.lng !== null
      ? `https://www.google.com/maps?q=${parking.lat},${parking.lng}&z=16&output=embed`
      : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> {tCommon("backToOverview")}
      </Link>

      <div className="surface-card rounded-xl border border-border/70 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              {parking.name}
            </h1>
            {parking.address ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {parking.address}
              </p>
            ) : null}
          </div>
          <FavoriteButton parkingId={parking.id} size="md" />
        </div>

        <div className="min-w-0">
          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            <ParkingStatusBadge parking={parking} />
            {parking.category ? (
              <MetaBadge>
                <ParkingLabel parking={parking} kind="lez" />
              </MetaBadge>
            ) : null}
            {parking.type ? (
              <MetaBadge>
                <ParkingLabel parking={parking} kind="type" />
              </MetaBadge>
            ) : null}
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <AvailabilityGauge
              percent={parking.freePercent}
              bucket={parking.bucket}
              size="lg"
            />
            <div>
              <div className="flex items-center gap-3">
                <p
                  className={
                    parking.hasLiveData
                      ? "font-heading text-5xl font-bold leading-none tracking-tight tabular-nums"
                      : "font-heading text-5xl font-bold leading-none tracking-tight tabular-nums text-muted-foreground"
                  }
                >
                  {parking.hasLiveData ? parking.freeSpaces : "—"}
                </p>
                {!parking.hasLiveData ? <LiveDataWarning size="md" /> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("spacesFree", { total: parking.totalSpaces })}
              </p>
              {parking.hasLiveData ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("occupied", { percent: Math.round(parking.occupiedPercent) })}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("unavailable")}
                </p>
              )}
              <DataFreshness parking={parking} serverNow={serverClock()} />
            </div>
          </div>

          <ParkingActions parking={parking} variant="full" className="mt-8" />

          {parking.description ? (
            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
              {parking.description}
            </p>
          ) : null}
        </div>

        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          {parking.openingHours ? (
            <div>
              <dt className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Clock className="size-3.5" /> {t("openingHours")}
              </dt>
              <dd className="mt-1 text-sm">{parking.openingHours}</dd>
            </div>
          ) : null}
          {parking.operator ? (
            <div>
              <dt className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Building2 className="size-3.5" /> {t("operator")}
              </dt>
              <dd className="mt-1 text-sm">{parking.operator}</dd>
            </div>
          ) : null}
          {parking.type ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("type")}
              </dt>
              <dd className="mt-1 text-sm">
                <ParkingLabel parking={parking} kind="type" />
              </dd>
            </div>
          ) : null}
          {parking.category ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("lez")}
              </dt>
              <dd className="mt-1 text-sm">
                <ParkingLabel parking={parking} kind="lez" />
              </dd>
            </div>
          ) : null}
        </dl>

        {parking.websiteUrl ? (
          <div className="mt-8">
            <Button asChild variant="outline" className="gap-1.5">
              <a
                href={parking.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("website")}
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      {getHistoryDataset(parking.id) ? (
        <div className="mt-6 surface-card rounded-xl border border-border/70 p-6 sm:p-8">
          <Suspense fallback={<HistorySkeleton />}>
            <HistorySection
              parkingId={parking.id}
              totalSpaces={parking.totalSpaces}
              lastUpdatedAt={parking.lastUpdatedAt}
            />
          </Suspense>
        </div>
      ) : null}

      {mapSrc ? (
        <div className="mt-6 surface-card overflow-hidden rounded-xl border border-border/70">
          <iframe
            title={t("mapTitle", { name: parking.name })}
            src={mapSrc}
            width="100%"
            height="360"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block w-full"
          />
        </div>
      ) : null}

    </div>
  );
}

async function HistorySection({
  parkingId,
  totalSpaces,
  lastUpdatedAt,
}: {
  parkingId: string;
  totalSpaces: number;
  lastUpdatedAt: number | null;
}) {
  const points = await getHistory(parkingId);
  if (!points || points.length === 0) {
    const t = await getTranslations("history");
    return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  }
  const trend = computeTrend(points);
  return (
    <ParkingHistorySection
      points={points}
      trend={trend}
      totalSpaces={totalSpaces || points[points.length - 1].totalSpaces}
      lastUpdatedAt={lastUpdatedAt}
      serverNow={serverClock()}
    />
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-56 w-full" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </div>
  );
}
