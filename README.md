# Ghent Parking

Live availability for Ghent's parking garages, built against the city's open data feeds.

Originally a technical-interview take-home ([ASSIGNMENT.md](ASSIGNMENT.md)) with a three-hour budget. The implementation plan is in [PLAN.md](PLAN.md), the visual system in [THEME.md](THEME.md), and the working punch list in [TODO.md](TODO.md).

## How this maps to the assignment

The brief asks for a small React app that helps the Lynx team check parking availability around the Kouter office before driving in. Everything the assignment lists is implemented, plus both bonus items:

| Assignment | Where it lives |
| --- | --- |
| First-visit form (first name, last name, license plate, car make/model) persisted across reloads | [components/onboarding-form.tsx](components/onboarding-form.tsx), schema in [lib/profile.schema.ts](lib/profile.schema.ts), persistence in [lib/profile.tsx](lib/profile.tsx) |
| Form hidden once the profile exists on the device | Gated by [components/profile-required.tsx](components/profile-required.tsx) on `/` and on every detail page |
| Profile page that edits and fully deletes the stored profile | [app/profile/](app/profile/) |
| Overview with name, open/closed, free spaces, address | [components/parking-card.tsx](components/parking-card.tsx) and [components/parking-list-view.tsx](components/parking-list-view.tsx) |
| Sort by name asc/desc, sort by free spaces asc/desc, search by name | [lib/parkings.ts](lib/parkings.ts) (`SORT_KEYS`, `sortParkings`) wired through [components/parking-overview.tsx](components/parking-overview.tsx) |
| Detail page with name, description, opening hours, website, operator, LEZ category, type | [app/parkings/[id]/page.tsx](app/parkings/%5Bid%5D/page.tsx) |
| **Bonus** — favorite parking pinned at the top | Up to 3 favorites as hero cards ([components/parking-hero-card.tsx](components/parking-hero-card.tsx)), state in [lib/favorites.tsx](lib/favorites.tsx) |
| **Bonus** — embedded Google Map on the detail page | iframe embed in [app/parkings/[id]/page.tsx](app/parkings/%5Bid%5D/page.tsx) |

### Beyond the brief

Built in the same three-hour window because the data made them cheap:

- **Parking Kouter, Zuid, Center** — the primary `bezetting-parkeergarages-real-time` feed doesn't include the Interparking garages, including the one directly under the Lynx office. Pulled from the secondary `mobi-parkings` feed and merged in ([lib/parkings.ts:7-26](lib/parkings.ts#L7-L26)).
- **Address fill-in** — primary feed leaves some addresses as `?`; backfilled from `locaties-openbare-parkings-gent` ([lib/parkings.ts:14-18](lib/parkings.ts#L14-L18)).
- **Occupancy history + trend** — `recente-bezetting-*` per-garage feeds power a recharts chart with a filling / emptying / stable indicator on detail pages ([components/parking-history-chart.tsx](components/parking-history-chart.tsx), [lib/parking-history.ts](lib/parking-history.ts)).
- **Filters + URL state** — status, LEZ, type, and availability bucket filters, plus list/card view toggle, all synced to the URL via nuqs so any view is shareable.
- **Auto-refresh** — visibility-aware polling (default 60 s, configurable, pauses when the tab is hidden), with a manual refresh button and last-updated stamp.
- **Navigation/contact actions** — open in Google Maps / Waze / Apple Maps, call the published phone number, share via Web Share API (falls back to clipboard).
- **Live-data warning** — banner when a feed entry looks stale or returns `-1` free spaces.
- **Vitest unit tests** — schema parsing, fetch merging, history pagination, profile schema.

### What I didn't do (and why)

These were considered and consciously cut to stay inside the three-hour budget; see the bottom of [TODO.md](TODO.md):

- **Dutch translations** via `next-intl`. English-only for now.
- **An embedded map showing all parkings at once** alongside the per-parking map.

The "live availability for some surface lots" gap is a data-source limitation — those lots aren't published in any of the three feeds.

## Workflow

20 small commits over ~3h on a single branch — see `git log` for the play-by-play. The shape: scaffold → data layer → list/detail UI → bonuses → polish (loading states, profile gate, tests, docs). [TODO.md](TODO.md) is the running scratchpad I kept open while working; left intact on purpose as a record of what I considered and decided.

## Stack

- **Next.js 16.2** (App Router) on **React 19**
- **TypeScript** end-to-end, with Zod schemas at every fetch / storage boundary
- **Tailwind v4** (CSS-first) + **shadcn/ui** (radix-ui primitives) + `tw-animate-css`
- **nuqs** for URL-synced search / sort / filters / view
- **@tanstack/react-table** for the list view
- **recharts** for the occupancy-history chart
- **react-hook-form** + `zodResolver` for the profile form
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

Open [http://localhost:3000](http://localhost:3000). The first paint will show the onboarding form; complete it once and the overview takes over on subsequent visits.

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
  page.tsx                    Overview (server) + onboarding gate
  parkings/[id]/              Detail page (server) + loading / error / not-found
  profile/                    Profile edit + delete
components/                   UI building blocks
  parking-overview.tsx        Overview client shell (search / sort / filter / view)
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
  onboarding-form.tsx         First-visit profile form
  profile-required.tsx        Profile gate wrapper
  trend-indicator.tsx         Filling / emptying / stable badge
  site-header.tsx, site-footer.tsx
  ui/                         shadcn primitives
lib/
  parkings.ts                 Server fetchers + merge across feeds
  parkings.schema.ts          Zod schema + Parking type + normaliser
  parking-history.ts          History fetcher + trend calculation
  profile.tsx                 ProfileProvider (localStorage)
  profile.schema.ts           Zod schema for the profile form
  favorites.tsx               FavoritesProvider (localStorage, max 3)
  local-storage-store.ts      SSR-safe localStorage helper
  use-auto-refresh.ts         Visibility-aware refresh hook
  *.test.ts                   Vitest unit tests
```

## Data sources

All from the City of Ghent open data portal:

- [`bezetting-parkeergarages-real-time`](https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time) — primary feed, current availability for most garages.
- [`mobi-parkings`](https://data.stad.gent/explore/dataset/mobi-parkings/) — secondary feed used only for the three Interparking garages (Kouter, Zuid, Center) the primary feed omits.
- [`locaties-openbare-parkings-gent`](https://gent.opendatasoft.com/explore/dataset/locaties-openbare-parkings-gent/) — static catalogue used to backfill missing addresses.
- `recente-bezetting-parking-<name>-gent` — per-garage recent-occupancy series powering the detail-page history chart (only published for a subset of garages).

## Credits

Built by Pieter-Jan Scheir — [scheir.eu](https://scheir.eu).
Data courtesy of [stad.gent open data](https://gent.opendatasoft.com).
