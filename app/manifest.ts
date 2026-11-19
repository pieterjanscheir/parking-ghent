import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import messages from "@/messages/nl.json";
import { BACKGROUND_COLOR, SITE_NAME } from "@/lib/site";

// Makes the site installable: "Add to Home Screen" on a phone opens it in its
// own window, without browser bars, under the icon below.
//
// A manifest has one language, so its texts are in the default one (Dutch).
// The app itself still opens in the visitor's own language: "/" redirects to
// the language they last chose.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE_NAME,
    // Shown under the home-screen icon, where long names get cut off.
    short_name: "Parking",
    description: messages.meta.description,
    lang: routing.defaultLocale,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: BACKGROUND_COLOR,
    categories: ["navigation", "travel"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        // Full-bleed version with the "P" inside the safe zone, for launchers
        // that crop icons to their own shape (circle, squircle, …).
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the home-screen icon to jump straight to these views.
    shortcuts: [
      { name: messages.overview.openWithSpace, url: "/?available=true" },
      { name: messages.overview.viewMap, url: "/?view=map" },
      { name: messages.parked.pageTitle, url: "/parked" },
    ],
  };
}
