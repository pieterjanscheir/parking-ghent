"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <div className="surface-card rounded-xl border border-border/70 p-8">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/30">
          <CircleAlert className="size-5 text-destructive" />
        </div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("body")}
        </p>
        <Button className="mt-6" onClick={() => reset()}>
          {tCommon("tryAgain")}
        </Button>
      </div>
    </div>
  );
}
