"use client";

import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/lib/use-auto-refresh";

// Keeps a city's live counts current: asks the server for the page again at
// the interval the visitor chose for the Ghent overview (a minute unless
// changed, never while the tab is hidden). Renders nothing.
export function CityRefresh() {
  const router = useRouter();
  useAutoRefresh(() => router.refresh());
  return null;
}
