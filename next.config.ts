import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow the parking photos served by the city of Ghent's CDN. Used on the
    // detail page for the three Interparking garages (Kouter, Zuid, Center)
    // sourced from the mobi-parkings fallback feed.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.stad.gent",
        pathname: "/mobi/parkingfoto/**",
      },
    ],
  },
};

export default nextConfig;
