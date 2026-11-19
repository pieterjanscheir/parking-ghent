import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ParkedPage } from "@/components/parked-page";
import { languageAlternates } from "@/lib/site";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "parked" });
  return {
    // The root layout's title template appends " — Ghent Parking".
    title: t("pageTitle"),
    description: t("pageIntro"),
    alternates: {
      canonical: `/${locale}/parked`,
      languages: languageAlternates("/parked"),
    },
  };
}

// "Where did I park?" Everything on it comes from the visitor's own browser,
// so the page itself is the same for everyone and is built ahead of time.
export default async function Parked({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The page reads a shared spot from the URL (?spot=…), which needs a
  // Suspense boundary on a page that is built ahead of time.
  return (
    <Suspense fallback={<div className="mx-auto h-64 max-w-3xl px-4 py-8 sm:px-6 sm:py-12" />}>
      <ParkedPage />
    </Suspense>
  );
}
