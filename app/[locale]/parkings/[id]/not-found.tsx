import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function ParkingNotFound() {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="font-heading text-sm font-medium uppercase tracking-wide text-muted-foreground">
        404
      </p>
      <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
        {t("garageNotFoundTitle")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("garageNotFoundBody")}
      </p>
      <Button asChild className="mt-6">
        <Link href="/">{tCommon("backToOverview")}</Link>
      </Button>
    </div>
  );
}
