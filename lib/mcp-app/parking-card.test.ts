import { describe, expect, it } from "vitest";
import { MCP_APP_MIME_TYPE, PARKING_CARD_HTML, PARKING_CARD_URI } from "./parking-card";

describe("parking card (MCP App)", () => {
  it("is addressed the way MCP Apps hosts expect", () => {
    expect(PARKING_CARD_URI.startsWith("ui://")).toBe(true);
    expect(MCP_APP_MIME_TYPE).toBe("text/html;profile=mcp-app");
  });

  it("is one self-contained page that loads only the site's fonts", () => {
    expect(PARKING_CARD_HTML.startsWith("<!doctype html>")).toBe(true);
    expect(PARKING_CARD_HTML).not.toMatch(/<script[^>]+src=/);
    const hrefs = [...PARKING_CARD_HTML.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => new URL(m[1]).origin);
    expect(new Set(hrefs)).toEqual(new Set(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]));
  });

  it("has a script that parses", () => {
    const script = PARKING_CARD_HTML.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  });

  it("speaks the MCP Apps handshake", () => {
    for (const method of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-result", "ui/notifications/size-changed", "ui/open-link"]) {
      expect(PARKING_CARD_HTML).toContain(method);
    }
  });
});
