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
import { AvailabilityGauge } from "@/components/availability-gauge";
import { FavoriteButton } from "@/components/favorite-button";
import { JsonBlock } from "@/components/json-block";
import {
  ParkingStatusBadge,
  MetaBadge,
} from "@/components/parking-status-badge";
import { Button } from "@/components/ui/button";

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
  const { parking, raw } = detail;

  const mapSrc =
    parking.lat !== null && parking.lng !== null
      ? `https://www.google.com/maps?q=${parking.lat},${parking.lng}&z=16&output=embed`
      : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
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

        {parking.description ? (
          <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
            {parking.description}
          </p>
        ) : null}

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

      <JsonBlock
        data={raw}
        title="Raw API response"
        subtitle="gent.opendatasoft.com — bezetting-parkeergarages-real-time"
      />
    </div>
  );
}
