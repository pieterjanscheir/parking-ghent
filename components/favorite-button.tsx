"use client";

import { Star } from "lucide-react";
import { toast } from "sonner";
import { useFavorites, MAX_FAVORITES } from "@/lib/favorites";
import { cn } from "@/lib/utils";

type Props = {
  parkingId: string;
  size?: "sm" | "md";
  className?: string;
};

export function FavoriteButton({ parkingId, size = "md", className }: Props) {
  const { isFavorite, canAdd, toggle } = useFavorites();
  const active = isFavorite(parkingId);
  const disabled = !active && !canAdd;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={
        active
          ? "Remove from favorites"
          : disabled
            ? `Favorite list is full (max ${MAX_FAVORITES})`
            : "Add to favorites"
      }
      title={
        disabled
          ? `Up to ${MAX_FAVORITES} favorites — remove one first`
          : undefined
      }
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-border/60 bg-card/60 text-muted-foreground transition-all",
        "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring",
        active && "border-primary/40 bg-primary/15 text-primary",
        disabled &&
          "cursor-not-allowed opacity-50 hover:border-border/60 hover:bg-card/60 hover:text-muted-foreground",
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const result = toggle(parkingId);
        if (!result.ok && result.reason === "at-capacity") {
          toast.warning(
            `Up to ${MAX_FAVORITES} favorites — remove one first.`,
          );
        }
      }}
    >
      <Star
        className={cn(size === "sm" ? "size-3.5" : "size-4")}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}
