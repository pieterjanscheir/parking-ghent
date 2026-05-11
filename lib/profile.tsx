"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { ProfileSchema, type Profile } from "./profile.schema";
import { useLocalStorageJson } from "./local-storage-store";

const STORAGE_KEY = "parking.profile.v1";

type ProfileContextValue = {
  ready: boolean;
  profile: Profile | null;
  save: (profile: Profile) => void;
  clear: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function parseProfile(raw: string): Profile | null {
  try {
    const parsed = ProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { value, mounted, write } = useLocalStorageJson<Profile>(
    STORAGE_KEY,
    parseProfile,
  );

  const save = useCallback(
    (profile: Profile) => {
      const valid = ProfileSchema.parse(profile);
      write(valid);
    },
    [write],
  );

  const clear = useCallback(() => {
    write(null);
  }, [write]);

  const ctx = useMemo<ProfileContextValue>(
    () => ({ ready: mounted, profile: value, save, clear }),
    [mounted, value, save, clear],
  );

  return (
    <ProfileContext.Provider value={ctx}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
