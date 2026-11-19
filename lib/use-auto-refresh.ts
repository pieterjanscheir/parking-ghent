"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useLocalStorageJson } from "./local-storage-store";

const STORAGE_KEY = "parking.refreshIntervalMs.v1";
export const DEFAULT_INTERVAL_MS = 60_000;

// `labelKey` is a key in the "refresh" messages.
export const REFRESH_OPTIONS = [
  { value: 30_000, labelKey: "every30s" },
  { value: 60_000, labelKey: "every1min" },
  { value: 300_000, labelKey: "every5min" },
  { value: 0, labelKey: "off" },
] as const;

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
  // The refresh runs as a transition, so `isRefreshing` stays true until the
  // server has actually answered — not for a fixed, cosmetic delay.
  const [isRefreshing, startRefresh] = useTransition();
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const fire = useCallback(() => {
    startRefresh(() => {
      onTickRef.current();
    });
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
    isRefreshing,
  };
}
