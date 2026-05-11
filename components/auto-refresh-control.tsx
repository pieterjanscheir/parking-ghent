"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REFRESH_OPTIONS } from "@/lib/use-auto-refresh";
import { cn } from "@/lib/utils";

type Props = {
  intervalMs: number;
  setInterval: (ms: number) => void;
  refreshNow: () => void;
  lastRefreshed: number;
  isRefreshing: boolean;
};

function formatAgo(now: number, ts: number): string {
  const secs = Math.max(0, Math.round((now - ts) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function AutoRefreshControl({
  intervalMs,
  setInterval,
  refreshNow,
  lastRefreshed,
  isRefreshing,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
          className={cn("size-3.5", isRefreshing && "animate-spin")}
        />
        <span>Refresh</span>
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatAgo(now, lastRefreshed)}
      </span>
    </div>
  );
}
