import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { dataAgeMs, isStale } from "@/lib/freshness";
import type { Parking } from "@/lib/parkings.schema";
import { cn } from "@/lib/utils";
import { useFormatAge } from "./use-labels";

type Size = "sm" | "md";

const ICON_SIZE: Record<Size, string> = {
  sm: "size-3",
  md: "size-3.5",
};

function WarningPill({
  label,
  message,
  size = "sm",
  className,
}: {
  label: string;
  message: string;
  size?: Size;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-4xl border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400",
              className,
            )}
            role="img"
            aria-label={message}
            onClick={(e) => e.stopPropagation()}
          >
            <AlertTriangle className={ICON_SIZE[size]} aria-hidden />
            <span>{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// The feed has no count for this garage at all (it reports -1).
export function LiveDataWarning({
  size = "sm",
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const t = useTranslations("freshness");
  return (
    <WarningPill
      label={t("noLiveData")}
      message={t("noLiveDataDetail")}
      size={size}
      className={className}
    />
  );
}

// The feed has a count, but it hasn't been updated for a while.
export function StaleDataWarning({
  ageMs,
  size = "sm",
  className,
}: {
  ageMs: number;
  size?: Size;
  className?: string;
}) {
  const t = useTranslations("freshness");
  const age = useFormatAge()(ageMs);
  return (
    <WarningPill
      label={t("updated", { age })}
      message={t("staleDetail", { age })}
      size={size}
      className={className}
    />
  );
}

// Whichever warning applies to this garage's count right now, if any.
export function DataWarning({
  parking,
  now,
  size = "sm",
  className,
}: {
  parking: Parking;
  now: number;
  size?: Size;
  className?: string;
}) {
  if (!parking.hasLiveData) {
    return <LiveDataWarning size={size} className={className} />;
  }
  if (isStale(parking, now)) {
    return (
      <StaleDataWarning
        ageMs={dataAgeMs(parking, now) ?? 0}
        size={size}
        className={className}
      />
    );
  }
  return null;
}
