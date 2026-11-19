"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatLatLng, type LatLng } from "@/lib/geo";
import { STREET_RATES_URL, ZONE_COLORS, type ZoneColor } from "@/lib/street-zones";
import { cn } from "@/lib/utils";

const DOT: Record<ZoneColor, string> = {
  red: "bg-red-500",
  orange: "bg-orange-400",
  yellow: "bg-yellow-300",
  green: "bg-emerald-400",
  blue: "bg-sky-400",
};

type Answer = { key: string; color: ZoneColor | null; url: string };

function readAnswer(key: string, json: unknown): Answer {
  const zone = (json as { zone?: { color?: unknown; url?: unknown } | null } | null)?.zone;
  const color = ZONE_COLORS.find((c) => c === zone?.color) ?? null;
  const url =
    typeof zone?.url === "string" && zone.url.startsWith("https://stad.gent/")
      ? zone.url
      : STREET_RATES_URL;
  return { key, color, url };
}

// "Street parking at Gravensteen: red zone (paid)" — which of the city's
// street-parking zones the destination is in, with a link to the city's
// rates. Shows nothing until the answer is in, and nothing if it can't be
// fetched: it is a footnote, not worth an error message.
export function StreetZoneNote({ place, at }: { place: string; at: LatLng }) {
  const t = useTranslations("street");
  const key = formatLatLng(at);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/street-zone?at=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: unknown) => setAnswer(readAnswer(key, json)))
      .catch(() => {
        /* aborted, offline or unavailable: stay silent */
      });
    return () => controller.abort();
  }, [key]);

  // An answer for an earlier destination doesn't apply to this one.
  if (!answer || answer.key !== key) return null;
  return (
    <p className="mt-2 border-t border-primary/15 pt-2 text-xs text-muted-foreground">
      {t("label", { place })}{" "}
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        {answer.color ? (
          <span aria-hidden className={cn("size-2 rounded-full", DOT[answer.color])} />
        ) : null}
        {answer.color ? t(`zones.${answer.color}`) : t("none")}
      </span>
      {answer.color ? (
        <>
          {" · "}
          <a
            href={answer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("rates")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </>
      ) : null}
    </p>
  );
}
