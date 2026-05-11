"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/profile";

export function ProfileRequired() {
  const router = useRouter();
  const { ready, profile } = useProfile();

  useEffect(() => {
    if (ready && !profile) {
      router.replace("/profile");
    }
  }, [ready, profile, router]);

  if (!ready || profile) return null;

  return (
    <div
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm"
    >
      <p className="text-sm text-muted-foreground">
        Redirecting to your profile…
      </p>
    </div>
  );
}
