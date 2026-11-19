# Ghent Parking

Live availability for Ghent's parking garages, built on the city's open data feeds. Open it, see where there's space, and get a short-term forecast of how that will change before you arrive. No sign-up, no personal data.

Originally a technical-interview take-home ([ASSIGNMENT.md](ASSIGNMENT.md)); since reworked into a public tool. The original plan is in [PLAN.md](PLAN.md), the visual system in [THEME.md](THEME.md).

## Features

- **Overview built for "where can I park?"** — headline stats (open garages, garages with space, total free spaces, the emptiest garage), sorted by most free spaces by default, with closed or no-data garages pushed to the bottom ([components/parking-overview.tsx](components/parking-overview.tsx), sorting in [lib/parkings.ts](lib/parkings.ts)).
- **Map view** — every garage on one map with its live free-space count, coloured by availability ([components/parking-map.tsx](components/parking-map.tsx), Leaflet + OpenStreetMap).
- **Search by destination** — "Where are you going?" sorts the garages by walking distance to a place, with an estimated walking time on every card ("340 m · ~6 min walk") and the destination pinned on the map. About 40 well-known Ghent places (Gravensteen, Vooruit, the hospitals, the stations …) are suggested instantly while typing, also by their English, French and older names; anything else, such as a street address, is looked up on OpenStreetMap when asked. The result is part of the URL, so "parking near Vooruit" can be shared — see [Destination search](#destination-search).
- **Near me** — optional browser geolocation to sort by distance and show how far each garage is. The location stays in memory, is never stored, and is never sent anywhere ([lib/use-geolocation.ts](lib/use-geolocation.ts)).
- **Open with space** quick filter, plus search by name or street and status / LEZ / type / availability filters, all synced to the URL so any view is shareable.
- **Short-term forecast** on cards ("~120 free in 30 min", "Likely full in ~20 min") and a 60-minute forecast with ranges on detail pages — see [Forecasting](#forecasting).
- **Favorites** — pin up to 3 garages to the top (stored only in the browser).
- **Detail pages** — opening hours, operator, LEZ, a map of the garage, navigation via Google Maps / Waze / Apple Maps, call, share.
- **Your choice of map** — garage pages show an OpenStreetMap map by default, so nothing is loaded from Google. Visitors who prefer Google Maps can switch in the settings menu (the gear in the header) or with the link under the map; the choice is remembered in their browser ([lib/map-provider.ts](lib/map-provider.ts)).
- **Auto-refresh** — visibility-aware polling (default 60 s) with manual refresh; the spinner runs for as long as the request actually takes.
- **Honest data age** — "City data updated 2 min ago" comes from the feed's own timestamps, not from when the page last asked. A garage whose count is more than 30 minutes old gets a warning and loses its forecast, and if no garage has updated for 15 minutes a banner says the feed has stopped ([lib/freshness.ts](lib/freshness.ts)).
- **Live-data warning** when a garage returns `-1` free spaces, and a clear message when the feed is down.
- **Dutch, English and French** — every page exists under `/nl`, `/en` and `/fr`. A first visit picks the browser's language (Dutch if it's none of the three), the choice is remembered, and the `NL · EN · FR` switcher in the header keeps your search, sort and filters — see [Languages](#languages).
- **Installable on a phone** — "Add to Home Screen" opens it in its own window under a parking-sign icon, with long-press shortcuts to *Garages with space* and *Map* ([app/manifest.ts](app/manifest.ts)). Shared links get a preview card, and search engines get a sitemap of every garage page.

## Forecasting

The city publishes only ~3 hours of minute-level history per garage, and there is no longer archive, so there are no daily or weekly patterns to learn from. The model in [lib/forecast.ts](lib/forecast.ts) is deliberately simple:

```
predicted free(t + m) = now + K · slope · τ · (1 − e^(−m/τ))
```

`slope` is the least-squares trend over the last 20 minutes (K = 0.75, τ = 15 min). The predicted change levels off instead of growing forever, because garages rarely keep filling at their current rate for a whole hour.

**How it was chosen.** On a replay of the live feeds (each forecast uses only data before its start time) it beat "nothing changes" by ~13% at 15 min, ~11% at 30 min and ~5% at 60 min. The previous model (a plain 60-minute linear extrapolation) did *worse* than "nothing changes", and its "95%" band held the real value only ~40% of the time. Settings near the chosen ones score within about a percent, so the constants aren't tuned to one afternoon, but the evaluation covers only a few hours of data, so treat the exact percentages as indicative.

**Per-garage checks.** Each forecast is replayed against that garage's own recent history, which gives:
- an accuracy line on the detail page ("off by ~11 spaces at 30 min, 14% better than assuming no change"),
- prediction ranges taken from the actual errors at each horizon (no Gaussian assumption), and
- a kill switch: if following the trend recently did worse than "nothing changes" for that garage, the app falls back to that and says so.

Forecasts exist only for the city-run garages that publish history (see `HISTORY_DATASETS` in [lib/parking-history.ts](lib/parking-history.ts)).

## Languages

Translations use [next-intl](https://next-intl.dev).

- **Where the text lives:** [messages/nl.json](messages/nl.json), [messages/en.json](messages/en.json) and [messages/fr.json](messages/fr.json). Components never contain user-facing text; they look it up with `useTranslations("namespace")`.
- **Routing:** [i18n/routing.ts](i18n/routing.ts) lists the languages and the default (Dutch). [proxy.ts](proxy.ts) redirects URLs without a language prefix, so old links such as `/parkings/parking-reep` keep working.
- **Links:** use `Link` and `useRouter` from [i18n/navigation.ts](i18n/navigation.ts), not from `next/link`, so navigation stays in the visitor's language.
- **Numbers, times and distances** follow the language too (`4.974` vs `4,974`, `1,3 km` vs `1.3 km`). Times are always Ghent time.
- **Search engines** get `hreflang` links between the three versions of each page, in the page head and in the sitemap, and one share image per language.
- **Not translated:** garage names, addresses, opening hours and descriptions come straight from the city's feed, in Dutch. The web manifest (install name and shortcuts) has a single language and uses Dutch.

**Adding a language:** add its code to `locales` in `i18n/routing.ts` (plus its name in `LOCALE_LABELS` and its Open Graph code in `OG_LOCALES` in `lib/site.ts`), then copy `messages/en.json` to `messages/<code>.json` and translate it. `pnpm test` fails if a language file is missing a key or uses different `{placeholders}` than the English one.

## Destination search

- **Well-known places** live in [lib/destinations.ts](lib/destinations.ts), with coordinates from OpenStreetMap. Matching ignores case and accents and also checks aliases ("castle of the counts", "ghelamco", "ziekenhuis"). These searches never leave the browser.
- **Everything else** goes to OpenStreetMap's [Nominatim](https://nominatim.org) search ([lib/geocode.ts](lib/geocode.ts)), limited to Ghent. It is called straight from the visitor's browser and only on request (Enter, or "Search all of Ghent for …") — never while typing, which Nominatim's [usage policy](https://operations.osmfoundation.org/policies/nominatim/) forbids. So it costs nothing to run, and each visitor has their own rate limit. If the service is down or refuses, the list of well-known places still works.
- **Walking time** is an estimate, not a route: straight-line distance plus 30% for real streets, at 4.8 km/h ([lib/geo.ts](lib/geo.ts)).
- **Privacy:** a free-text search sends the typed text, and the visitor's IP address, to the OpenStreetMap Foundation — the same party that already serves the map tiles. Nothing is sent for the well-known places.

## Talking to the city's feeds

Every visitor used to trigger a fresh round of ~20 upstream requests on each page view and each auto-refresh. Now the server keeps a small in-memory cache ([lib/ttl-cache.ts](lib/ttl-cache.ts)), so upstream load depends on time, not on how many people are looking:

| Feed | Reused for |
| --- | --- |
| Live availability | 30 s |
| Recent history (per garage) | 60 s |
| Street addresses | 24 h, and the last good copy is kept if a refresh fails |

- **Strict TTL, on purpose.** Next's built-in `fetch` cache is stale-while-revalidate: the first visitor after a quiet hour would get hour-old counts. This cache never returns anything older than its TTL.
- Concurrent requests share one upstream call, and the overview, the detail page and its title all reuse the same data.
- Each upstream call times out after 4 s and is retried once ([lib/upstream.ts](lib/upstream.ts)); a failure is remembered for 5 s so an outage isn't hammered.
- The cache lives in the server instance's memory, so each running instance keeps its own copy. That's enough at this scale and needs no extra service.

## Stack

- **Next.js 16.2** (App Router) on **React 19**
- **next-intl** for translations and language routing
- **TypeScript** end-to-end, with Zod schemas at every fetch / storage boundary
- **Tailwind v4** (CSS-first) + **shadcn/ui** (radix-ui primitives) + `tw-animate-css`
- **nuqs** for URL-synced search / sort / filters / view
- **@tanstack/react-table** for the list view
- **recharts** for the occupancy-history chart
- **Leaflet** + **react-leaflet** for the overview map (OpenStreetMap tiles)
- **sonner** for toasts
- **lucide-react** for icons
- **Vitest** for unit tests
- Fonts: **Geist** (headings + mono), **Raleway** (body) via `next/font/google`

> ⚠️ This is Next.js 16, which has breaking changes from older releases (see [AGENTS.md](AGENTS.md)). Consult `node_modules/next/dist/docs/` before reaching for App Router APIs from memory.

## Getting started

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `pnpm dev`         | Start the dev server                  |
| `pnpm build`       | Production build                      |
| `pnpm start`       | Serve the production build            |
| `pnpm lint`        | Run ESLint                            |
| `pnpm test`        | Run the Vitest suite once             |
| `pnpm test:watch`  | Run Vitest in watch mode              |

## Project layout

```
app/                          App Router routes
  [locale]/                   Everything a visitor sees, per language
    layout.tsx                Root layout: <html lang>, providers, metadata
    page.tsx                  Overview (server)
    parkings/[id]/            Detail page (server) + loading / error / not-found
    opengraph-image.tsx       Share preview card, one per language
    [...rest]/page.tsx        Translated "page not found" for unknown paths
  manifest.ts                 Web app manifest (name, icons, shortcuts)
  icon.svg, apple-icon.png    App icon (source artwork: icon.svg)
  sitemap.ts, robots.ts       For search engines (previews are not indexed)
i18n/                         Language list, language-aware links, request setup
messages/                     Translations: nl.json, en.json, fr.json
proxy.ts                      Language detection and redirects
components/                   UI building blocks
  parking-overview.tsx        Overview client shell (summary / search / sort / filter / view)
  parking-map.tsx             Leaflet map of all parkings (client-only)
  forecast-hint.tsx           One-line forecast for cards / list / map
  destination-search.tsx      "Where are you going?" box with suggestions
  language-switcher.tsx       NL · EN · FR links in the header
  settings-menu.tsx           Gear menu in the header (map choice)
  parking-location-map.tsx    Garage-page map: OpenStreetMap or Google, per the setting
  leaflet-shared.ts           Tiles, dark filter and marker shared by both maps
  use-labels.ts               Shared translation helpers (ages, distances, labels)
  parking-actions.tsx         Maps / Waze / Apple Maps / Call / Share row
  parking-hero-card.tsx       Favorite card
  parking-card.tsx            Standard grid card
  parking-list-view.tsx       TanStack Table view
  parking-filters.tsx         Filter controls
  parking-history-chart.tsx   Recharts occupancy-history chart
  parking-skeletons.tsx       Per-segment loading states
  data-freshness.tsx          "Updated 2 min ago" on the detail page
  parking-status-badge.tsx    Status pill
  availability-gauge.tsx      SVG ring used in every card / row
  auto-refresh-control.tsx    Interval picker + manual refresh
  favorite-button.tsx         Favorite toggle
  live-data-warning.tsx       "No live data" / "Updated 42 min ago" pills
  trend-indicator.tsx         Filling / emptying / stable badge
  site-header.tsx, site-footer.tsx
  ui/                         shadcn primitives
lib/
  site.ts                     Site name, URL and colours for metadata
  parkings.ts                 Server fetchers + sort / filter helpers
  parkings.schema.ts          Zod schema + Parking type + normaliser
  parking-history.ts          History fetcher
  ttl-cache.ts                In-memory cache with a strict time-to-live
  upstream.ts                 Portal fetch with timeout + one retry
  freshness.ts                Data-age and staleness helpers
  use-now.ts                  Shared ticking clock for "x min ago" labels
  forecast.ts                 Forecast model + per-parking backtest
  geo.ts                      Distance and walking-time helpers
  destinations.ts             Well-known Ghent places + matching
  geocode.ts                  OpenStreetMap place search (browser-side)
  use-geolocation.ts          Opt-in browser location
  map-provider.ts             The visitor's map choice (localStorage)
  favorites.tsx               FavoritesProvider (localStorage, max 3)
  local-storage-store.ts      SSR-safe localStorage helper
  use-auto-refresh.ts         Visibility-aware refresh hook
  *.test.ts                   Vitest unit tests
```

### App icons

The home-screen icons in `public/icons/` and `app/apple-icon.png` are PNG exports of [app/icon.svg](app/icon.svg). The `maskable` one is the same sign at 80% on a full blue square, so launchers that crop icons to a circle don't cut into the "P". If the artwork changes, re-export all four.

The site URL used in share tags, `robots.txt` and the sitemap comes from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, so it follows the project's production domain without a code change.

## Data sources

All from the City of Ghent open data portal:

- [`bezetting-parkeergarages-real-time`](https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time) — the live feed: current availability per garage.
- [`locaties-openbare-parkings-gent`](https://gent.opendatasoft.com/explore/dataset/locaties-openbare-parkings-gent/) — static catalogue used to backfill missing addresses.
- `recente-bezetting-parking-<name>-gent` — per-garage recent-occupancy series powering the detail-page history chart (only published for a subset of garages).

The three Interparking garages (Kouter, Zuid, Center) are not listed. They used to come from a separate `mobi-parkings` dataset, which is no longer on the portal (checked November 2026), and the catalogue has no public replacement yet.

## Credits

Built by Pieter-Jan Scheir — [scheir.eu](https://scheir.eu).
Data courtesy of [stad.gent open data](https://gent.opendatasoft.com).
