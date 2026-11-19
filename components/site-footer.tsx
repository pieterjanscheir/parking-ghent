import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("footer");
  return (
    <footer className="mt-12 border-t border-border/40">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-6 py-6 sm:flex-row">
        <p className="text-sm text-foreground">
          {t("builtBy")}{" "}
          <a
            href="https://www.scheir.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Pieter-Jan Scheir | scheir.eu
          </a>
        </p>
        <p className="text-xs text-muted-foreground">
          {t("dataSource")}
          {" · "}
          <Link href="/mcp" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("mcp")}
          </Link>
        </p>
      </div>
    </footer>
  );
}
