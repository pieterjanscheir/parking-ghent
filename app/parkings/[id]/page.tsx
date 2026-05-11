import { Suspense, cache } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  MapPin,
  Building2,
} from "lucide-react";
import { fetchParkingById, fetchParkingDetailById } from "@/lib/parkings";
import {
  computeTrend,
  fetchParkingHistoryWithRaw,
  getHistoryDataset,
} from "@/lib/parking-history";

// React's `cache()` dedupes within a single render — the chart and the
// JSON section can both call this without triggering two network round-trips.
const getHistory = cache(fetchParkingHistoryWithRaw);
import { AvailabilityGauge } from "@/components/availability-gauge";
import { FavoriteButton } from "@/components/favorite-button";
import { JsonBlock } from "@/components/json-block";
import { ParkingActions } from "@/components/parking-actions";
import { ParkingHistoryChart } from "@/components/parking-history-chart";
import { ProfileRequired } from "@/components/profile-required";
import {
  ParkingStatusBadge,
  MetaBadge,
} from "@/components/parking-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parking = await fetchParkingById(decodeURIComponent(id));
  return {
    title: parking
      ? `${parking.name} — Ghent Parking`
      : "Parking — Ghent Parking",
  };
}

export default async function ParkingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await fetchParkingDetailById(decodeURIComponent(id));
  if (!detail) notFound();
  const { parking, calls: listCalls } = detail;

  const mapSrc =
    parking.lat !== null && parking.lng !== null
      ? `https://www.google.com/maps?q=${parking.lat},${parking.lng}&z=16&output=embed`
      : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ProfileRequired />
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to overview
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

        <div
          className={
            parking.photoUrl
              ? "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-start md:gap-10"
              : ""
          }
        >
          <div className="min-w-0">
            <div className="mt-6 flex flex-wrap items-center gap-1.5">
              <ParkingStatusBadge parking={parking} />
              {parking.category ? (
                <MetaBadge>{parking.categoryLabel}</MetaBadge>
              ) : null}
              {parking.type ? <MetaBadge>{parking.typeLabel}</MetaBadge> : null}
            </div>

            <div className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <AvailabilityGauge
                percent={parking.freePercent}
                bucket={parking.bucket}
                size="lg"
              />
              <div>
                <p className="font-heading text-5xl font-bold leading-none tracking-tight tabular-nums">
                  {parking.freeSpaces}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  of {parking.totalSpaces} spaces free
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(parking.occupiedPercent)}% currently occupied
                </p>
              </div>
            </div>

            <ParkingActions parking={parking} variant="full" className="mt-8" />

            {parking.description ? (
              <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
                {parking.description}
              </p>
            ) : null}
          </div>

          {parking.photoUrl ? (
            // Right column on md+; top-aligned with the badges row of the
            // left column. On mobile (no grid) it stacks at the end so live
            // availability stays the focus.
            <div className="mt-8 md:mt-6">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border/60 bg-muted">
                <Image
                  src={parking.photoUrl}
                  alt={`Photo of ${parking.name} parking`}
                  fill
                  sizes="(min-width: 768px) 20rem, 100vw"
                  className="object-cover"
                />
              </div>
            </div>
          ) : null}
        </div>

        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          {parking.openingHours ? (
            <div>
              <dt className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Clock className="size-3.5" /> Opening hours
              </dt>
              <dd className="mt-1 text-sm">{parking.openingHours}</dd>
            </div>
          ) : null}
          {parking.operator ? (
            <div>
              <dt className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Building2 className="size-3.5" /> Operator
              </dt>
              <dd className="mt-1 text-sm">{parking.operator}</dd>
            </div>
          ) : null}
          {parking.type ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Type
              </dt>
              <dd className="mt-1 text-sm">{parking.typeLabel}</dd>
            </div>
          ) : null}
          {parking.category ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Low emission zone
              </dt>
              <dd className="mt-1 text-sm">{parking.categoryLabel}</dd>
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
                Visit website
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      {getHistoryDataset(parking.id) ? (
        <div className="mt-6 surface-card rounded-xl border border-border/70 p-6 sm:p-8">
          <Suspense fallback={<HistorySkeleton />}>
            <HistorySection parkingId={parking.id} totalSpaces={parking.totalSpaces} />
          </Suspense>
        </div>
      ) : null}

      {mapSrc ? (
        <div className="mt-6 surface-card overflow-hidden rounded-xl border border-border/70">
          <iframe
            title={`Map of ${parking.name}`}
            src={mapSrc}
            width="100%"
            height="360"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block w-full"
          />
        </div>
      ) : null}

      <section aria-label="Raw API responses" className="mt-10">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Raw API responses
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every upstream call this page made, in the order it was issued.
        </p>
        {listCalls.map((call) => (
          <JsonBlock
            key={call.id}
            data={call.data}
            title={call.title}
            subtitle={call.subtitle}
            defaultOpen={call.id === "bezetting-parkeergarages-real-time"}
          />
        ))}
        {getHistoryDataset(parking.id) ? (
          <Suspense fallback={<JsonSkeleton />}>
            <HistoryJsonSection parkingId={parking.id} />
          </Suspense>
        ) : null}
      </section>
    </div>
  );
}

async function HistorySection({
  parkingId,
  totalSpaces,
}: {
  parkingId: string;
  totalSpaces: number;
}) {
  const result = await getHistory(parkingId);
  if (!result || result.points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No recent history available for this parking.
      </p>
    );
  }
  const { points } = result;
  const trend = computeTrend(points);
  return (
    <ParkingHistoryChart
      points={points}
      trend={trend}
      totalSpaces={totalSpaces || points[points.length - 1].totalSpaces}
    />
  );
}

async function HistoryJsonSection({ parkingId }: { parkingId: string }) {
  const result = await getHistory(parkingId);
  if (!result) return null;
  return (
    <>
      {result.calls.map((call) => (
        <JsonBlock
          key={call.id}
          data={call.data}
          title={call.title}
          subtitle={call.subtitle}
          defaultOpen={false}
        />
      ))}
    </>
  );
}

function JsonSkeleton() {
  return <Skeleton className="mt-6 h-14 w-full rounded-xl" />;
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
