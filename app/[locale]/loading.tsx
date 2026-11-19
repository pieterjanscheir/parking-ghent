"use client";

import { useSyncExternalStore } from "react";
import { useFavorites } from "@/lib/favorites";
import {
  CardGridSkeleton,
  HeroGridSkeleton,
  ListViewSkeleton,
  OverviewControlsSkeleton,
  OverviewHeaderSkeleton,
} from "@/components/parking-skeletons";

const noopSubscribe = () => () => {};
const getView = (): "cards" | "list" =>
  new URLSearchParams(window.location.search).get("view") === "list"
    ? "list"
    : "cards";
const getServerView = (): "cards" | "list" => "cards";

function useViewParam(): "cards" | "list" {
  return useSyncExternalStore(noopSubscribe, getView, getServerView);
}

export default function Loading() {
  const { ready, ids } = useFavorites();
  const view = useViewParam();
  const favCount = ready ? ids.length : 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <OverviewHeaderSkeleton />
      <HeroGridSkeleton count={favCount} />
      <OverviewControlsSkeleton />
      {view === "list" ? <ListViewSkeleton /> : <CardGridSkeleton />}
    </div>
  );
}
