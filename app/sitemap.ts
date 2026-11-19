import type { MetadataRoute } from "next";
import { fetchParkings } from "@/lib/parkings";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home = { url: SITE_URL };
  try {
    const parkings = await fetchParkings();
    return [
      home,
      ...parkings.map((p) => ({
        url: `${SITE_URL}/parkings/${encodeURIComponent(p.id)}`,
      })),
    ];
  } catch {
    // The city's feed is down: still serve a valid sitemap.
    return [home];
  }
}
