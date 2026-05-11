# Ghent Parking

Live availability for Ghent's parking garages, built against the city's open data feed.

Originally a technical-interview assignment ([ASSIGNMENT.md](ASSIGNMENT.md)) — the implementation plan is in [PLAN.md](PLAN.md), the visual system in [THEME.md](THEME.md), and an ongoing punch list in [TODO.md](TODO.md).

## Features

- **Onboarding & profile** — first-visit form (name, license plate, car) persisted in `localStorage`. Editable and erasable from `/profile`.
- **Overview** — every Ghent garage with name, status, free spaces, address, and an at-a-glance availability dial.
  - Search by name; sort by name / free spaces / % free.
  - Filter by status, LEZ category, parking type, and availability bucket.
  - Card grid or dense list view (TanStack Table) — view, query, sort, and filters are URL-stated via nuqs so the page is shareable.
  - Up to 3 favorites pinned at the top as oversized hero cards.
  - Auto-refresh (default 60 s, configurable, pauses on hidden tab) with manual refresh and last-updated timestamp.
- **Detail page** — description, opening hours, operator, LEZ category, type, website link, embedded Google Map, and the raw API record for debugging.
- **Navigation & contact actions** — open the parking in Google Maps / Waze / Apple Maps, call the phone number (when published in the dataset), and share the page via the Web Share API (falls back to copying the link). Available on the detail page and on every favorite hero card.
- **Polish** — dark-only oklch theme with violet accent, loading / error / not-found states per segment, accessible labels, responsive layout.

## Stack

- **Next.js 16.2** (App Router) on **React 19**
- **TypeScript** end-to-end, with Zod schemas at every fetch / storage boundary
- **Tailwind v4** (CSS-first) + **shadcn/ui** (radix-ui primitives) + `tw-animate-css`
- **nuqs** for URL-synced search / sort / filters / view
- **@tanstack/react-table** for the list view
- **react-hook-form** + `zodResolver` for the profile form
- **sonner** for toasts
- **lucide-react** for icons
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

| Command       | What it does                          |
| ------------- | ------------------------------------- |
| `pnpm dev`    | Start the dev server                  |
| `pnpm build`  | Production build                      |
| `pnpm start`  | Serve the production build            |
| `pnpm lint`   | Run ESLint                            |

## Project layout

```
app/                       App Router routes
  page.tsx                 Overview (server) + onboarding gate
  parkings/[id]/           Detail page (server) + loading / error / not-found
  profile/                 Profile edit + delete
components/                UI building blocks
  parking-actions.tsx      Maps / Waze / Apple Maps / Call / Share row
  parking-hero-card.tsx    Favorite card
  parking-card.tsx         Standard grid card
  parking-list-view.tsx    TanStack Table view
  availability-gauge.tsx   SVG ring used in every card / row
  ui/                      shadcn primitives
lib/
  parkings.ts              Server fetchers + filter/sort helpers
  parkings.schema.ts       Zod schema + Parking type + normaliser
  profile.tsx              ProfileProvider (localStorage)
  favorites.tsx            FavoritesProvider (localStorage, max 3)
  use-auto-refresh.ts      Visibility-aware refresh hook
```

## Data source

Real-time occupancy comes from the City of Ghent open data portal:

- [`bezetting-parkeergarages-real-time`](https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time)

State that isn't there yet (P+R lots, live availability for some surface lots, Parking Kouter) is tracked in [TODO.md](TODO.md).

## Credits

Built by Pieter-Jan Scheir — [scheir.eu](https://scheir.eu).
Data courtesy of [stad.gent open data](https://gent.opendatasoft.com).
