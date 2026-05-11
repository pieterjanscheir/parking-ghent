import { cn } from "@/lib/utils";

type Bucket = "available" | "almost-full" | "full" | "closed";

type Props = {
  percent: number;
  bucket: Bucket;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

const BUCKET_COLOR: Record<Bucket, string> = {
  available: "oklch(0.72 0.17 142)",
  "almost-full": "oklch(0.75 0.16 70)",
  full: "oklch(0.66 0.21 25)",
  closed: "oklch(0.5 0.005 280)",
};

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "size-12",
  md: "size-16",
  lg: "size-24",
};

const LABEL_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

const CIRCUMFERENCE = 97.39; // 2π × 15.5

export function AvailabilityGauge({
  percent,
  bucket,
  size = "md",
  showLabel = true,
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = BUCKET_COLOR[bucket];
  const dash = (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className={cn("relative", SIZE_CLASS[size], className)}>
      <svg viewBox="0 0 36 36" className="-rotate-90 size-full">
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="oklch(1 0 0 / 0.07)"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
          style={{ filter: `drop-shadow(0 0 6px ${color} / 0.5)` }}
        />
      </svg>
      {showLabel ? (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-heading font-semibold tabular-nums text-foreground",
            LABEL_CLASS[size],
          )}
        >
          {Math.round(clamped)}%
        </span>
      ) : null}
    </div>
  );
}
