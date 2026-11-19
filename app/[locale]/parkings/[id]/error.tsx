"use client";

import { useEffect } from "react";
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
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        {t("garageTitle")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("garageBody")}
      </p>
      <Button className="mt-6" onClick={() => reset()}>
        {tCommon("tryAgain")}
      </Button>
    </div>
  );
}
