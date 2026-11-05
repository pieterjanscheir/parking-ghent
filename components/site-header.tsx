"use client";

import Link from "next/link";
import { CircleParking } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5"
          aria-label="Ghent Parking — home"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25 transition-all group-hover:bg-primary/25 group-hover:ring-primary/40">
            <CircleParking className="size-4 text-primary" />
          </span>
          <span className="font-heading text-sm font-semibold tracking-tight">
            Ghent Parking
          </span>
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 motion-safe:animate-pulse rounded-full bg-emerald-400" aria-hidden />
          Live data · Stad Gent
        </span>
      </div>
    </header>
  );
}
