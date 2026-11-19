"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};
const getMountedClient = () => true;
const getMountedServer = () => false;

/**
 * SSR-safe localStorage subscription helper. Returns the parsed value (or null)
 * and a setter that persists + notifies any other hook instance reading the
 * same key.
 *
 * Server snapshot is always `null` so the first hydration matches the initial
 * unauthenticated render.
 */

// Browsers can refuse localStorage outright (blocked site data, some private
// modes) or refuse a write (storage full). A choice the visitor makes must
// still take effect, so a value that couldn't be stored is kept here for the
// rest of the visit instead — it just won't survive closing the tab.
const unsaved = new Map<string, string | null>();

export function readStored(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// `raw` is the JSON text to store, or null to remove the key.
export function writeStored(key: string, raw: string | null): void {
  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
    unsaved.delete(key);
  } catch {
    unsaved.set(key, raw);
  }
}

// Test hook: module state would otherwise leak between test cases.
export function clearUnsaved(): void {
  unsaved.clear();
}

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
    return readStored(key);
  }, [key]);

  const snapshot = useSyncExternalStore(
    subscribeToKey,
    getSnapshot,
    () => null,
  );

  // useSyncExternalStore returns the server snapshot on the first client
  // render too, so this stays false through hydration and flips to true on
  // the post-hydration render — matching SSR without a setState-in-effect.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    getMountedClient,
    getMountedServer,
  );
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
      writeStored(key, next === null ? null : JSON.stringify(next));
      // Always notify, also when the value could only be kept in memory.
      emit(key);
    },
    [key],
  );

  return { value, mounted, write };
}
