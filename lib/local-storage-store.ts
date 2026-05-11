"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * SSR-safe localStorage subscription helper. Returns the parsed value (or null)
 * and a setter that persists + notifies any other hook instance reading the
 * same key.
 *
 * Server snapshot is always `null` so the first hydration matches the initial
 * unauthenticated render.
 */

const EVENT_PREFIX = "parking-ls:";
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_PREFIX + key));
  }
}

function subscribe(key: string, cb: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === key) cb();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", storageHandler);
    window.addEventListener(EVENT_PREFIX + key, cb);
  }
  return () => {
    listeners.get(key)?.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener(EVENT_PREFIX + key, cb);
    }
  };
}

export function useLocalStorageJson<T>(
  key: string,
  parse: (raw: string) => T | null,
): { value: T | null; mounted: boolean; write: (next: T | null) => void } {
  // Stable subscriber and snapshot per `key` — without these, every render
  // would resubscribe and produce a new snapshot reference, cascading new
  // refs through every context that wraps this hook.
  const subscribeToKey = useCallback(
    (cb: () => void) => subscribe(key, cb),
    [key],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  }, [key]);

  const snapshot = useSyncExternalStore(
    subscribeToKey,
    getSnapshot,
    () => null,
  );

  const mounted = typeof window !== "undefined";
  // Parse only when the underlying localStorage string changes — otherwise
  // every render returns a fresh object reference and cascades into infinite
  // re-renders in any downstream useMemo/useCallback that depends on it.
  const value = useMemo(
    () => (snapshot ? parse(snapshot) : null),
    [snapshot, parse],
  );

  const write = useCallback(
    (next: T | null) => {
      if (typeof window === "undefined") return;
      if (next === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(next));
      }
      emit(key);
    },
    [key],
  );

  return { value, mounted, write };
}
