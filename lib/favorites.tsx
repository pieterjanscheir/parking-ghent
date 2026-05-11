"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { z } from "zod";
import { useLocalStorageJson } from "./local-storage-store";

const STORAGE_KEY = "parking.favorites.v1";
export const MAX_FAVORITES = 3;

const FavoritesSchema = z.array(z.string()).max(MAX_FAVORITES);

type FavoritesContextValue = {
  ready: boolean;
  ids: string[];
  isFavorite: (id: string) => boolean;
  canAdd: boolean;
  toggle: (id: string) => { ok: boolean; reason?: "at-capacity" };
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function parseFavorites(raw: string): string[] | null {
  try {
    const parsed = FavoritesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { value, mounted, write } = useLocalStorageJson<string[]>(
    STORAGE_KEY,
    parseFavorites,
  );

  const ids = useMemo(() => value ?? [], [value]);

  const isFavorite = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback(
    (id: string) => {
      if (ids.includes(id)) {
        write(ids.filter((x) => x !== id));
        return { ok: true };
      }
      if (ids.length >= MAX_FAVORITES) {
        return { ok: false, reason: "at-capacity" as const };
      }
      write([...ids, id]);
      return { ok: true };
    },
    [ids, write],
  );

  const ctx = useMemo<FavoritesContextValue>(
    () => ({
      ready: mounted,
      ids,
      isFavorite,
      canAdd: ids.length < MAX_FAVORITES,
      toggle,
    }),
    [mounted, ids, isFavorite, toggle],
  );

  return (
    <FavoritesContext.Provider value={ctx}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return ctx;
}
