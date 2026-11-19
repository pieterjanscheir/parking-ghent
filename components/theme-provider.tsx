"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

// Light and dark. The choice (dark, light, or "same as this device") is kept
// in the browser by next-themes, which also sets the class on <html> before
// the first paint, so a light-theme visitor never sees a dark flash.
//
// Dark stays the default: it is what the site has always looked like, and
// nobody should find it changed without having asked.
export const THEME_STORAGE_KEY = "parking.theme";
export const THEMES = ["dark", "light", "system"] as const;
export type ThemeChoice = (typeof THEMES)[number];

// The browser bar and the phone's status bar, to match the page.
const BAR_COLOR = { dark: "#1c1d1f", light: "#fafafa" } as const;

function BrowserBarColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const color = resolvedTheme === "light" ? BAR_COLOR.light : BAR_COLOR.dark;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <BrowserBarColor />
      {children}
    </NextThemesProvider>
  );
}
