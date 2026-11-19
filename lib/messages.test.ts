import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALE_INFO, routing } from "../i18n/routing";

const MESSAGES_DIR = join(__dirname, "..", "messages");

function load(locale: string): unknown {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

// One catalog per language the site offers, so a newly added language is
// checked without touching this file.
const catalogs: Record<string, unknown> = Object.fromEntries(
  routing.locales
    .filter((locale) => existsSync(join(MESSAGES_DIR, `${locale}.json`)))
    .map((locale) => [locale, load(locale)]),
);
const en = catalogs.en;

// "overview.stats.openNow" → "Open now"
function flatten(node: unknown, prefix = ""): Record<string, string> {
  if (typeof node === "string") return { [prefix]: node };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    Object.assign(out, flatten(value, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

// The {placeholders} a message expects, e.g. "{count} free in {minutes} min"
// → ["count", "minutes"]. Plural branches ("one {…}") are not placeholders.
function placeholders(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

const reference = flatten(en);

describe("message catalogs", () => {
  it("exist for every language the site offers", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...routing.locales].sort());
  });

  it("has a name for the language menu for every language", () => {
    for (const locale of routing.locales) {
      expect(LOCALE_INFO[locale].name, locale).toBeTruthy();
      expect(LOCALE_INFO[locale].openGraph, locale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });

  describe.each(Object.keys(catalogs).filter((l) => l !== "en"))("%s", (locale) => {
    const messages = flatten(catalogs[locale]);

    it("has exactly the same keys as English", () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(reference).sort());
    });

    it("uses the same placeholders as English in every message", () => {
      const mismatches = Object.keys(reference)
        .filter((key) => key in messages)
        .filter(
          (key) =>
            placeholders(messages[key]).join() !== placeholders(reference[key]).join(),
        );
      expect(mismatches).toEqual([]);
    });

    it("has no empty messages", () => {
      const empty = Object.keys(messages).filter((key) => !messages[key].trim());
      expect(empty).toEqual([]);
    });
  });

  it("never puts a straight apostrophe right before a placeholder", () => {
    // In the message syntax, '{ starts a quoted section and would silently
    // swallow the placeholder (e.g. French "d'{name}").
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const broken = Object.entries(flatten(catalog))
        .filter(([, message]) => /'[{}]/.test(message))
        .map(([key]) => `${locale}:${key}`);
      expect(broken).toEqual([]);
    }
  });
});
