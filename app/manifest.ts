import type { MetadataRoute } from "next";
import { BACKGROUND_COLOR, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Makes the site installable: "Add to Home Screen" on a phone opens it in its
// own window, without browser bars, under the icon below.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE_NAME,
    // Shown under the home-screen icon, where long names get cut off.
    short_name: "Parking",
    description: SITE_DESCRIPTION,
    lang: "en",
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
      {
        name: "Garages with space",
        short_name: "With space",
        url: "/?available=true",
      },
      { name: "Map", url: "/?view=map" },
    ],
  };
}
