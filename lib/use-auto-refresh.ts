"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorageJson } from "./local-storage-store";

const STORAGE_KEY = "parking.refreshIntervalMs.v1";
export const DEFAULT_INTERVAL_MS = 60_000;

export const REFRESH_OPTIONS: { value: number; label: string }[] = [
  { value: 30_000, label: "Every 30 s" },
  { value: 60_000, label: "Every 1 min" },
  { value: 300_000, label: "Every 5 min" },
  { value: 0, label: "Off" },
];

function parseInterval(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useAutoRefresh(onTick: () => void) {
  const { value: storedInterval, write } = useLocalStorageJson<number>(
    STORAGE_KEY,
    parseInterval,
  );
  const intervalMs = storedInterval ?? DEFAULT_INTERVAL_MS;
  const [lastRefreshed, setLastRefreshed] = useState<number>(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const fire = useCallback(() => {
    setIsRefreshing(true);
    onTickRef.current();
    setLastRefreshed(Date.now());
    window.setTimeout(() => setIsRefreshing(false), 400);
  }, []);

  useEffect(() => {
    if (intervalMs <= 0) return;
    let timer: number | null = null;

    const start = () => {
      timer = window.setInterval(() => {
        if (!document.hidden) fire();
      }, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    start();
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (timer === null) {
        fire();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, fire]);

  const setInterval = useCallback(
    (next: number) => {
      write(next);
    },
    [write],
  );

  const refreshNow = useCallback(() => {
    fire();
  }, [fire]);

  return {
    intervalMs,
    setInterval,
    refreshNow,
    lastRefreshed,
    isRefreshing,
  };
}
