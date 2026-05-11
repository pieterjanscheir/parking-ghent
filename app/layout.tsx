import type { Metadata } from "next";
import { Geist, Geist_Mono, Raleway } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { ProfileProvider } from "@/lib/profile";
import { FavoritesProvider } from "@/lib/favorites";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" });
const raleway = Raleway({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ghent Parking",
  description:
    "Live parking availability for Ghent — see where to park before you drive.",
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
          <ProfileProvider>
            <FavoritesProvider>
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </FavoritesProvider>
          </ProfileProvider>
        </NuqsAdapter>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
