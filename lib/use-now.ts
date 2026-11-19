"use client";

import { useSyncExternalStore } from "react";

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

// `serverNow` is the server's clock when the data was rendered. It is used
// as-is for the server render and hydration (so both agree), and afterwards as
// a floor: a device whose clock runs behind can't make data look newer than
// the server already knew it to be.
export function useNow(serverNow: number): number {
  const clientNow = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return Math.max(clientNow, serverNow);
}
