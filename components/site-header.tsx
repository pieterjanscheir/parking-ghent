"use client";

import Link from "next/link";
import { CircleParking, User } from "lucide-react";

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
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-sm text-muted-foreground transition-all hover:border-border hover:bg-card hover:text-foreground"
        >
          <User className="size-3.5" />
          <span>Profile</span>
        </Link>
      </div>
    </header>
  );
}
