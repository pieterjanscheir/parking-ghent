import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MESSAGE =
  "Live availability is unavailable right now — the count shown may be stale.";

type Size = "sm" | "md";

const ICON_SIZE: Record<Size, string> = {
  sm: "size-3",
  md: "size-3.5",
};

export function LiveDataWarning({
  size = "sm",
  className,
}: {
  size?: Size;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-4xl border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400",
              className,
            )}
            role="img"
            aria-label={MESSAGE}
            onClick={(e) => e.stopPropagation()}
          >
            <AlertTriangle className={ICON_SIZE[size]} aria-hidden />
            <span>No live data</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{MESSAGE}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
