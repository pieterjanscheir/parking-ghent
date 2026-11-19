"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { pageWasSavedAt, useDeviceNow } from "@/lib/use-now";
import { useFormatAge } from "./use-labels";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

// Asks the service worker whether this page load was answered from a saved
// copy, and when that copy was saved.
function askPageSource(): Promise<number | null> {
  return new Promise((resolve) => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return resolve(null);
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (event: MessageEvent<{ savedAt?: unknown }>) => {
      window.clearTimeout(timer);
      const savedAt = event.data?.savedAt;
      resolve(typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : null);
    };
    worker.postMessage({ type: "page-source" }, [channel.port2]);
  });
}

// Registers the service worker (public/sw.js) and says so when the visitor is
// looking at a saved copy or has no connection. Without this notice an offline
// page would look exactly like a live one.
export function OfflineNotice() {
  const t = useTranslations("offline");
  const formatAge = useFormatAge();
  const now = useDeviceNow();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    // Not in development: a worker that saves pages gets in the way of
    // seeing your own changes.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* no offline support in this browser session; the site works without */
    });
    let cancelled = false;
    askPageSource().then((when) => {
      if (cancelled || when === null) return;
      pageWasSavedAt(when);
      setSavedAt(when);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (savedAt === null && online) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-800 dark:text-amber-200"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      <span>
        {savedAt !== null && now > 0
          ? t("savedCopy", { age: formatAge(Math.max(0, now - savedAt)) })
          : t("noConnection")}
      </span>
      {online ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-medium underline underline-offset-4 hover:text-amber-100"
        >
          {t("reload")}
        </button>
      ) : null}
    </div>
  );
}
