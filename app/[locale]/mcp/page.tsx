import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CopyField } from "@/components/copy-field";
import { SITE_URL, languageAlternates } from "@/lib/site";

type Props = { params: Promise<{ locale: string }> };

// The tools the server offers, as registered in app/api/mcp/route.ts.
const TOOLS = [
  "list_garages",
  "find_parking",
  "get_garage",
  "cheapest_parking",
  "typical_availability",
  "list_cities",
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mcpPage" });
  return {
    // The root layout's title template appends " — Ghent Parking".
    title: t("title"),
    description: t("intro"),
    alternates: {
      canonical: `/${locale}/mcp`,
      languages: languageAlternates("/mcp"),
    },
  };
}

// How to connect an AI assistant to this site's MCP server (app/api/mcp), and
// what it can then look up. Built ahead of time: nothing on it changes
// between visitors.
export default async function McpPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("mcpPage");
  const tTariffs = await getTranslations("tariffs");
  const heading = "mt-10 font-heading text-lg font-semibold tracking-tight";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>

      <div className="mt-6 surface-card rounded-xl border border-border/70 p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("urlLabel")}
        </p>
        <CopyField value={`${SITE_URL}/api/mcp`} copyLabel={t("copy")} copiedLabel={t("copied")} />
      </div>

      <h2 className={heading}>{t("connectTitle")}</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">{t("otherClients")}</p>

      <h2 className={heading}>{t("toolsTitle")}</h2>
      <dl className="mt-3 space-y-3">
        {TOOLS.map((tool) => (
          <div key={tool} className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
            <dt>
              <code className="font-mono text-sm font-semibold">{tool}</code>
            </dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {/* Described with the rest of the rates feature (messages: "tariffs"). */}
              {tool === "cheapest_parking" ? tTariffs("mcpTool") : t(`tools.${tool}`)}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className={heading}>{t("examplesTitle")}</h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {(["example1", "example2", "example3", "example4"] as const).map((key) => (
          <li key={key} className="rounded-lg bg-muted/50 px-3 py-2 italic">
            {t(key)}
          </li>
        ))}
      </ul>

      <h2 className={heading}>{t("notesTitle")}</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {(["note1", "note2", "note3", "note4", "note5"] as const).map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </div>
  );
}
