# Ghent Parking

Live availability for Ghent's parking garages, built on the city's open data feeds. Open it, see where there's space, and get a short-term forecast of how that will change before you arrive. No sign-up, no personal data.

Originally a technical-interview take-home ([ASSIGNMENT.md](ASSIGNMENT.md)); since reworked into a public tool. The original plan is in [PLAN.md](PLAN.md), the visual system in [THEME.md](THEME.md).

## Features

- **Overview built for "where can I park?"** — headline stats (open garages, garages with space, total free spaces, the emptiest garage), sorted by most free spaces by default, with closed or no-data garages pushed to the bottom ([components/parking-overview.tsx](components/parking-overview.tsx), sorting in [lib/parkings.ts](lib/parkings.ts)).
- **Map view** — every garage on one map with its live free-space count, coloured by availability ([components/parking-map.tsx](components/parking-map.tsx), Leaflet + OpenStreetMap).
- **Near me** — optional browser geolocation to sort by distance and show how far each garage is. The location stays in memory, is never stored, and is never sent anywhere ([lib/use-geolocation.ts](lib/use-geolocation.ts)).
- **Open with space** quick filter, plus search by name or street and status / LEZ / type / availability filters, all synced to the URL so any view is shareable.
- **Short-term forecast** on cards ("~120 free in 30 min", "Likely full in ~20 min") and a 60-minute forecast with ranges on detail pages — see [Forecasting](#forecasting).
- **Favorites** — pin up to 3 garages to the top (stored only in the browser).
- **Detail pages** — opening hours, operator, LEZ, embedded map, navigation via Google Maps / Waze / Apple Maps, call, share.
- **Auto-refresh** — visibility-aware polling (default 60 s) with manual refresh.
- **Live-data warning** when a feed entry looks stale or returns `-1` free spaces, and a clear message when the feed is down.

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

## Stack

- **Next.js 16.2** (App Router) on **React 19**
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
  page.tsx                    Overview (server)
  parkings/[id]/              Detail page (server) + loading / error / not-found
components/                   UI building blocks
  parking-overview.tsx        Overview client shell (summary / search / sort / filter / view)
  parking-map.tsx             Leaflet map of all parkings (client-only)
  forecast-hint.tsx           One-line forecast for cards / list / map
  parking-actions.tsx         Maps / Waze / Apple Maps / Call / Share row
  parking-hero-card.tsx       Favorite card
  parking-card.tsx            Standard grid card
  parking-list-view.tsx       TanStack Table view
  parking-filters.tsx         Filter controls
  parking-history-chart.tsx   Recharts occupancy-history chart
  parking-skeletons.tsx       Per-segment loading states
  parking-status-badge.tsx    Status pill
  availability-gauge.tsx      SVG ring used in every card / row
  auto-refresh-control.tsx    Interval picker + manual refresh
  favorite-button.tsx         Favorite toggle
  live-data-warning.tsx       Stale-feed banner
  trend-indicator.tsx         Filling / emptying / stable badge
  site-header.tsx, site-footer.tsx
  ui/                         shadcn primitives
lib/
  parkings.ts                 Server fetchers + merge across feeds
  parkings.schema.ts          Zod schema + Parking type + normaliser
  parking-history.ts          History fetcher
  forecast.ts                 Forecast model + per-parking backtest
  geo.ts                      Distance helpers
  use-geolocation.ts          Opt-in browser location
  favorites.tsx               FavoritesProvider (localStorage, max 3)
  local-storage-store.ts      SSR-safe localStorage helper
  use-auto-refresh.ts         Visibility-aware refresh hook
  *.test.ts                   Vitest unit tests
```

## Data sources

All from the City of Ghent open data portal:

- [`bezetting-parkeergarages-real-time`](https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time) — primary feed, current availability for most garages.
- [`mobi-parkings`](https://data.stad.gent/explore/dataset/mobi-parkings/) — secondary feed for the three Interparking garages (Kouter, Zuid, Center) the primary feed omits. **As of November 2026 this dataset has been removed from the portal (404)**, so those garages don't show up; the app tolerates the failure.
- [`locaties-openbare-parkings-gent`](https://gent.opendatasoft.com/explore/dataset/locaties-openbare-parkings-gent/) — static catalogue used to backfill missing addresses.
- `recente-bezetting-parking-<name>-gent` — per-garage recent-occupancy series powering the detail-page history chart (only published for a subset of garages).

## Credits

Built by Pieter-Jan Scheir — [scheir.eu](https://scheir.eu).
Data courtesy of [stad.gent open data](https://gent.opendatasoft.com).
