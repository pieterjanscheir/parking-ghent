"use client";

import { useCallback, useSyncExternalStore } from "react";

// "Install this app": Chromium browsers announce that the site can be
// installed with a `beforeinstallprompt` event and let a button on the page
// open the install dialog. Safari on iPhone has no such event; there the
// visitor has to use Share → Add to Home Screen, so the menu explains that.

type InstallEvent = Event & { prompt: () => Promise<unknown> };

let pending: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// Registered once, as soon as this module loads in the browser: the event
// can fire before any component has mounted.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own mini-banner away; the menu offers it instead.
    event.preventDefault();
    pending = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type InstallState =
  // The browser offers an install dialog.
  | "available"
  // An iPhone or iPad in the browser: installing goes through the Share menu.
  | "ios"
  // Already installed, or a browser that doesn't install sites.
  | "none";

function currentState(): InstallState {
  if (pending) return "available";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "none";
  // iPads report themselves as Macs; a Mac with a touch screen is an iPad.
  const ios =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "none";
}

export function useInstallPrompt(): { state: InstallState; install: () => void } {
  const state = useSyncExternalStore<InstallState>(subscribe, currentState, () => "none");
  const install = useCallback(() => {
    const event = pending;
    if (!event) return;
    // An install event can be used once.
    pending = null;
    notify();
    void event.prompt().catch(() => undefined);
  }, []);
  return { state, install };
}
