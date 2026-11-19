import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { BACKGROUND_COLOR, BRAND_BLUE, SITE_NAME } from "@/lib/site";

// The preview card shown when the site is shared in a chat or on social
// media — one per language, at /<language>/opengraph-image.
export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ locale: string }> };

// Build the three images once at build time instead of on every request.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

async function translations(params: Props["params"]) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  return getTranslations({ locale: safeLocale });
}

export default async function Image({ params }: Props) {
  const t = await translations(params);
  const features = t("share.features").split("|");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: BACKGROUND_COLOR,
          color: "#f3f3f5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="64" fill={BRAND_BLUE} />
            <path
              d="M170 415V123h90a82 82 0 0 1 0 164h-90"
              fill="none"
              stroke="#fff"
              strokeWidth="52"
            />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 600 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            {t("overview.title")}
          </div>
          <div style={{ fontSize: 36, color: "#9d9ea3" }}>{t("meta.tagline")}</div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {features.map((feature) => (
            <div
              key={feature}
              style={{
                display: "flex",
                padding: "12px 24px",
                borderRadius: 999,
                border: "2px solid #3c3d40",
                background: "#27272b",
                fontSize: 26,
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
