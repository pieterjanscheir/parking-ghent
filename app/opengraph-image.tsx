import { ImageResponse } from "next/og";
import {
  BACKGROUND_COLOR,
  BRAND_BLUE,
  SHARE_IMAGE,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site";

// The preview card shown when the site is shared in a chat or on social media.
export const alt = SHARE_IMAGE.alt;
export const size = { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height };
export const contentType = "image/png";

const FEATURES = ["Live availability", "30-minute forecast", "Map", "Near me"];

export default function Image() {
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
            Where to park in Ghent
          </div>
          <div style={{ fontSize: 36, color: "#9d9ea3" }}>{SITE_TAGLINE}</div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {FEATURES.map((feature) => (
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
