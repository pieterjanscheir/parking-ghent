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

// The device's own clock, ticking every 15 s; 0 during server render and
// hydration. For things timed by this device alone (when the visitor parked).
export function useDeviceNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// When this page first saw each server timestamp, by the device's clock.
// Module-level so it survives navigating away and back: a page restored from
// the router's cache then still knows how long ago its data arrived.
const receivedAt = new Map<number, number>();
const MAX_REMEMBERED = 100;

// This page came from a copy the service worker saved earlier (no
// connection): the data on it arrived when that copy was saved, not when
// the page opened. Without this, an hour-old copy would read "updated just
// now".
export function pageWasSavedAt(deviceTime: number): void {
  for (const [serverNow, seenAt] of receivedAt) {
    if (deviceTime < seenAt) receivedAt.set(serverNow, deviceTime);
  }
  savedCopyAt = deviceTime;
  tick();
}

// Set once per page load, before or after the components first render.
let savedCopyAt: number | null = null;

const getSavedCopyAt = () => savedCopyAt;
const getNoSavedCopy = () => null;

// When this page's saved copy was made (device clock), or null for a page
// that came from the network.
export function useSavedCopyAt(): number | null {
  return useSyncExternalStore(subscribe, getSavedCopyAt, getNoSavedCopy);
}

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
    // The first data on a page loaded from a saved copy is as old as the
    // copy; anything that arrives later (a refresh) is new.
    receivedAt.set(serverNow, receivedAt.size === 0 && savedCopyAt !== null ? savedCopyAt : Date.now());
    if (receivedAt.size > MAX_REMEMBERED) {
      const oldest = receivedAt.keys().next().value;
      if (oldest !== undefined) receivedAt.delete(oldest);
    }
  }, [serverNow]);

  return advanceServerClock(serverNow, receivedAt.get(serverNow), clientNow);
}
