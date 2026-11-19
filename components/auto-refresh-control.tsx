"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatAge } from "@/lib/freshness";
import { REFRESH_OPTIONS } from "@/lib/use-auto-refresh";
import { cn } from "@/lib/utils";

type Props = {
  intervalMs: number;
  setInterval: (ms: number) => void;
  refreshNow: () => void;
  isRefreshing: boolean;
  // When the city's feed last changed (newest garage update), and the current
  // time to measure it against. This is the age of the data itself — not of
  // our last request, which says nothing if the feed has stopped updating.
  dataUpdatedAt: number | null;
  now: number;
};

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Brussels",
});

export function AutoRefreshControl({
  intervalMs,
  setInterval,
  refreshNow,
  isRefreshing,
  dataUpdatedAt,
  now,
}: Props) {
  const isOn = intervalMs > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            isOn ? "bg-primary" : "bg-muted-foreground/50",
          )}
        />
        <span className="text-xs text-muted-foreground">Auto refresh</span>
      </div>
      <Select
        value={String(intervalMs)}
        onValueChange={(v) => setInterval(Number.parseInt(v, 10))}
      >
        <SelectTrigger size="sm" className="h-7 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REFRESH_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={String(opt.value)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={refreshNow}
        aria-label="Refresh now"
        className="gap-1.5"
      >
        <RefreshCw
          className={cn("size-3.5", isRefreshing && "motion-safe:animate-spin")}
        />
        <span>Refresh</span>
      </Button>
      {dataUpdatedAt !== null ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          City data updated{" "}
          <time dateTime={new Date(dataUpdatedAt).toISOString()}>
            {formatAge(Math.max(0, now - dataUpdatedAt))} ({TIME_FMT.format(dataUpdatedAt)})
          </time>
        </span>
      ) : null}
    </div>
  );
}
