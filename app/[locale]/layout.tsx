import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Geist, Geist_Mono, Raleway } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { FavoritesProvider } from "@/lib/favorites";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { routing } from "@/i18n/routing";
import {
  BACKGROUND_COLOR,
  SITE_NAME,
  SITE_URL,
  openGraphLocale,
} from "@/lib/site";
import { cn } from "@/lib/utils";
import "../globals.css";

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" });
const raleway = Raleway({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const title = `${SITE_NAME} — ${t("tagline")}`;
  return {
    // Lets relative URLs below (and the share image) resolve to absolute ones.
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s — ${SITE_NAME}` },
    description: t("description"),
    applicationName: SITE_NAME,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: openGraphLocale(locale),
      title,
      description: t("description"),
    },
    twitter: { card: "summary_large_image" },
    // iOS: open from the home screen in its own window, named like the icon.
    appleWebApp: {
      capable: true,
      title: "Parking",
      statusBarStyle: "black",
    },
  };
}

export const viewport: Viewport = {
  // Colours the browser / status bar to match the page instead of white.
  themeColor: BACKGROUND_COLOR,
  colorScheme: "dark",
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Tells next-intl which language this render is in.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={cn(
        "dark h-full antialiased",
        raleway.variable,
        geistHeading.variable,
        geistMono.variable,
        "font-sans",
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider>
          <NuqsAdapter>
            <FavoritesProvider>
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </FavoritesProvider>
          </NuqsAdapter>
          <Toaster position="top-center" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
