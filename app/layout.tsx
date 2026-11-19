import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Raleway } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { FavoritesProvider } from "@/lib/favorites";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  BACKGROUND_COLOR,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" });
const raleway = Raleway({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Lets relative URLs below (and the share image) resolve to absolute ones.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_BE",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  // iOS: open from the home screen in its own window, named like the icon.
  appleWebApp: {
    capable: true,
    title: "Parking",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  // Colours the browser / status bar to match the page instead of white.
  themeColor: BACKGROUND_COLOR,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark h-full antialiased",
        raleway.variable,
        geistHeading.variable,
        geistMono.variable,
        "font-sans",
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NuqsAdapter>
          <FavoritesProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </FavoritesProvider>
        </NuqsAdapter>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
