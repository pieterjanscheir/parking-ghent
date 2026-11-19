"use client";

import { useEffect, useSyncExternalStore } from "react";

// A shared "current time" that ticks every 15 s — fine-grained enough for
// "updated 3 min ago" labels without re-rendering every second.
const TICK_MS = 15_000;

let current = 0;
let timer: number | null = null;
const listeners = new Set<() => void>();

function tick() {
  current = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = window.setInterval(tick, TICK_MS);
    // Background tabs throttle timers; catch up as soon as the tab is back.
    document.addEventListener("visibilitychange", tick);
  }
  // The cached value may be old if nothing was subscribed for a while.
  current = Date.now();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      timer = null;
    }
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => 0;

// When this page first saw each server timestamp, by the device's clock.
// Module-level so it survives navigating away and back: a page restored from
// the router's cache then still knows how long ago its data arrived.
const receivedAt = new Map<number, number>();
const MAX_REMEMBERED = 100;

// The server's clock, carried forward by the time that has passed on this
// device since the data arrived. Only the *difference* between two readings
// of the device clock is used, so a phone whose clock is an hour off still
// gets the right answer. (Wall-clock difference rather than a monotonic
// timer, because those stop while a phone sleeps.)
export function advanceServerClock(
  serverNow: number,
  seenAt: number | undefined,
  clientNow: number,
): number {
  // Server render, hydration, or data that arrived this very moment.
  if (clientNow === 0 || seenAt === undefined) return serverNow;
  return serverNow + Math.max(0, clientNow - seenAt);
}

// `serverNow` is the server's clock when the data was rendered.
export function useNow(serverNow: number): number {
  const clientNow = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (receivedAt.has(serverNow)) return;
    receivedAt.set(serverNow, Date.now());
    if (receivedAt.size > MAX_REMEMBERED) {
      const oldest = receivedAt.keys().next().value;
      if (oldest !== undefined) receivedAt.delete(oldest);
    }
  }, [serverNow]);

  return advanceServerClock(serverNow, receivedAt.get(serverNow), clientNow);
}
