"use client";

import { Compass, MapPin, Navigation2, Phone, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Parking } from "@/lib/parkings.schema";

type Variant = "compact" | "full";

function googleMapsUrl(lat: number, lng: number, name: string) {
  const dest = encodeURIComponent(`${lat},${lng}`);
  const q = encodeURIComponent(name);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving&dir_action=navigate&destination_place_id=${q}`;
}

function wazeUrl(lat: number, lng: number) {
  return `https://www.waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
}

function appleMapsUrl(lat: number, lng: number, name: string) {
  const q = encodeURIComponent(name);
  return `https://maps.apple.com/?daddr=${lat},${lng}&q=${q}&dirflg=d`;
}

function stopAndOpen(url: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };
}

function stopAndCall(phone: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = `tel:${phone.replace(/\s+/g, "")}`;
  };
}

async function handleShare(parking: Parking, e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  const url = `${window.location.origin}/parkings/${encodeURIComponent(parking.id)}`;
  const text = parking.hasLiveData
    ? `${parking.freeSpaces} of ${parking.totalSpaces} spaces free`
    : `Live availability unavailable (${parking.totalSpaces} total spaces)`;
  const data = { title: parking.name, text, url };
  try {
    if (navigator.share && navigator.canShare?.(data) !== false) {
      await navigator.share(data);
      return;
    }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  } catch {
    toast.error("Couldn't share or copy link");
  }
}

type ActionButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
  tooltip?: string;
  icon: React.ReactNode;
  label?: string;
  size: "sm" | "icon-sm";
};

function ActionButton({
  onClick,
  ariaLabel,
  tooltip,
  icon,
  label,
  size,
}: ActionButtonProps) {
  const button = (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {icon}
      {label ? <span>{label}</span> : null}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

type Props = {
  parking: Parking;
  variant?: Variant;
  className?: string;
};

export function ParkingActions({
  parking,
  variant = "compact",
  className,
}: Props) {
  const hasCoords = parking.lat !== null && parking.lng !== null;
  const lat = parking.lat ?? 0;
  const lng = parking.lng ?? 0;

  const isFull = variant === "full";
  const size = isFull ? "sm" : "icon-sm";
  // Compact buttons are icon-only — always tooltip. Full buttons have a
  // visible label, so tooltip only when it adds info the label doesn't
  // already convey (e.g. the actual phone number).
  const labelTooltip = (text: string) => (isFull ? undefined : text);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        {hasCoords ? (
          <>
            <ActionButton
              size={size}
              onClick={stopAndOpen(googleMapsUrl(lat, lng, parking.name))}
              ariaLabel="Navigate with Google Maps"
              tooltip={labelTooltip("Google Maps")}
              icon={<MapPin aria-hidden />}
              label={isFull ? "Google Maps" : undefined}
            />
            <ActionButton
              size={size}
              onClick={stopAndOpen(wazeUrl(lat, lng))}
              ariaLabel="Navigate with Waze"
              tooltip={labelTooltip("Waze")}
              icon={<Navigation2 aria-hidden />}
              label={isFull ? "Waze" : undefined}
            />
            <ActionButton
              size={size}
              onClick={stopAndOpen(appleMapsUrl(lat, lng, parking.name))}
              ariaLabel="Navigate with Apple Maps"
              tooltip={labelTooltip("Apple Maps")}
              icon={<Compass aria-hidden />}
              label={isFull ? "Apple Maps" : undefined}
            />
          </>
        ) : null}
        {parking.phone ? (
          <ActionButton
            size={size}
            onClick={stopAndCall(parking.phone)}
            ariaLabel={`Call ${parking.phone}`}
            tooltip={parking.phone}
            icon={<Phone aria-hidden />}
            label={isFull ? "Call" : undefined}
          />
        ) : null}
        <ActionButton
          size={size}
          onClick={(e) => void handleShare(parking, e)}
          ariaLabel="Share this parking"
          tooltip={labelTooltip("Share")}
          icon={<Share2 aria-hidden />}
          label={isFull ? "Share" : undefined}
        />
      </div>
    </TooltipProvider>
  );
}
