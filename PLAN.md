# Ghent Parking — Implementation Plan

## Scope

**Core (assignment)**
1. Onboarding form (first name, last name, license plate, car make/model) with localStorage persistence. Hidden once filled.
2. Profile page — edit fields, delete profile entirely.
3. Parking overview — name, open/closed, free spaces, address. Sort by name (asc/desc) and free spaces (asc/desc). Search by name.
4. Parking detail page — name, description, opening hours, website link, operator, LEZ category (inside/outside), type.

**Bonuses (assignment)**
5. Favorite parking pinned to the top of the overview — extended to **1–3 favorites**, each shown as an oversized hero card above the rest of the list.
6. Embedded map on the detail page.

**Extras (beyond 3h baseline, in scope for this exercise)**
7. **Filters** derived from the live dataset fields — open/closed, LEZ category (inside/outside), parking type, availability bucket (full / almost full / available). Multi-select chips, combined with search + sort.
8. **Auto-refresh** of the overview, on by default at a 60 s cadence, with an inline control to override the interval (e.g. 30 s, 1 min, 5 min, off) and a manual "Refresh now" button. Last-refreshed timestamp shown next to the control.
9. **Dual views** for the overview — card grid (default) and dense list. The list view uses **TanStack Table** for column sorting, search, and pagination if needed. The view choice persists in the URL.
10. **Availability graphic** — each card and list row prominently shows free spaces *and* the percentage free, rendered as a small radial/dial chart that recolors with the availability bucket. Headline number is the count; the dial is the at-a-glance signal.
11. **Header + footer** — simple sticky header (app name, profile link) and a footer crediting "Pieter-Jan Scheir — [scher.eu](https://scher.eu)".
12. Tests — unit + component coverage with Vitest + React Testing Library.
13. Polish — loading / error / not-found / empty states, responsive layout, accessible labels and keyboard nav.
14. URL state for search, sort, filters, and view via **nuqs** so the overview is shareable and back/forward works. Favorites stay in localStorage (per-device).
15. Custom theme — dark-only, violet-accent oklch palette (see [theme.md](theme.md) for the full spec; summarised below).

**Out of scope**
- Backend / auth / database — localStorage is the spec.
- CI config — `pnpm test` locally is enough for handover.
- i18n.
- E2E tests — RTL covers user flows well enough at this size.

## Tech & constraints

- Next.js **16.2.6** + React **19**, App Router, shadcn/ui (`radix-vega`), Tailwind v4 CSS-first config, `tw-animate-css`, Geist + Raleway via `next/font/google`. Full theme spec in [theme.md](theme.md).
- Per [AGENTS.md](AGENTS.md), consult [node_modules/next/dist/docs/01-app](node_modules/next/dist/docs/01-app) before using App Router APIs — v16 has breaking changes from training data.
- Persistence: `localStorage` (single device, no backend) for profile + favorites (array of up to 3 ids) + view-mode fallback.
- URL state: **nuqs** (`useQueryState`) for `q`, `sort`, filter facets, and `view`.
- Tables: **@tanstack/react-table** v8 for the list view (headless, no styling baggage).
- Data: real-time occupancy from `bezetting-parkeergarages-real-time`. Verify whether the same dataset includes static metadata for the detail page or if a second dataset (e.g. `parkings-gent`) is needed — quick fetch before coding. The same probe should enumerate which categorical fields exist (LEZ, type, operator, isopennow) so the filter set is grounded in reality, not guessed.

## Architecture

- **Data layer** (`lib/parkings.ts` + `lib/parkings.schema.ts`): typed fetchers for list + by-id, server-side with `fetch` + `next: { revalidate: 30 }`. Zod validates at the fetch boundary. Derived helpers compute `freePercent`, `availabilityBucket` (`full` < 5%, `almost-full` < 20%, `available` ≥ 20%), and expose the unique values of each categorical facet for the filter UI.
- **Profile layer** (`lib/profile.ts` + `lib/profile.schema.ts` + `ProfileProvider` client context): `useProfile()` returns `{ profile, save, clear }` reading/writing `localStorage` under one key. SSR-safe (hydrates after mount). Same zod schema validates form input (via `zodResolver`) and localStorage reads — tampered/old payloads are rejected and treated as no-profile.
- **Favorites layer** (`lib/favorites.ts` + `FavoritesProvider` client context): `useFavorites()` returns `{ ids, toggle, isFavorite, canAdd }`. Stored as an ordered array under one localStorage key. `canAdd` is false when length === 3; `toggle` on a non-favorite when at capacity surfaces a toast ("Up to 3 favorites — remove one first").
- **Refresh layer** (`useAutoRefresh(intervalMs, onTick)` hook in `lib/use-auto-refresh.ts`): owns a `setInterval`, pauses on `document.hidden` (visibility API) to avoid background hammering, exposes `lastRefreshed`, `isRefreshing`, `refreshNow`, `setInterval`. Default 60 s. The overview's client wrapper invokes `router.refresh()` on tick to re-pull the server-fetched list.
- **URL state** (nuqs): overview reads `q`, `sort` (`name-asc|name-desc|spaces-asc|spaces-desc|percent-asc|percent-desc`), `view` (`cards|list`), and the filter facets as comma-separated string arrays (`status`, `lez`, `type`, `bucket`). `NuqsAdapter` mounted in root layout. Favorites and refresh interval stay client-only.
- **All TS types** come from `z.infer<typeof Schema>` — no parallel hand-written interfaces.

### Routes & special files
- `/` — server fetches parkings (with `searchParams` for first paint). Client wrapper checks profile: no profile → onboarding form; profile → overview with search/sort/filters/view + favorites strip on top.
- `/profile` — edit form + delete; on delete, redirect to `/`.
- `/parkings/[id]` — server-fetched detail + map.

Per Next 16 App Router conventions, each segment ships:
- `loading.tsx` — Suspense fallback (skeleton list on `/`, skeleton card on `/parkings/[id]`).
- `error.tsx` — client component, recovers via `reset()`, renders branded error card.
- `not-found.tsx` — `/parkings/[id]/not-found.tsx` for unknown IDs; root `app/not-found.tsx` for unmatched routes.
- Root `app/global-error.tsx` — last-resort boundary that wraps `<html>` / `<body>` itself.

### Layout chrome
- `app/layout.tsx` renders `<SiteHeader />` and `<SiteFooter />` around `{children}`.
  - **Header** — sticky, translucent (`bg-background/80 backdrop-blur-xl`) with `border-b border-border/40`, app wordmark left (tinted `bg-primary/15` rounded chip + lucide mark), profile pill-button right (the muted pill recipe from [theme.md](theme.md)). No nav, no search bar — search lives in the overview.
  - **Footer** — single thin row inside `border-t border-border/40`: "Built by Pieter-Jan Scheir — [scher.eu](https://scher.eu)" rendered as a `text-primary hover:underline` link, plus a quieter `text-xs text-muted-foreground` line "Data: stad.gent open data". No social icons, no columns.

## Overview UI shape

```
┌─────────────────────────────────────────────────────────────┐
│  Header (wordmark · profile)                                │
├─────────────────────────────────────────────────────────────┤
│  H1 "Parkings in Ghent"                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ★ Favorites (1–3 oversized hero cards, side-by-side│    │
│  │     on desktop, stacked on mobile)                  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [Search]  [Sort ▾]  [Filters: status • lez • type   │    │
│  │  • bucket]   [View ⌷⏵ cards/list]                    │    │
│  │ Auto-refresh: ● 1 min ▾  ⟳ Refresh now  · 12 s ago   │    │
│  └─────────────────────────────────────────────────────┘    │
│  [Cards grid OR TanStack list]                              │
├─────────────────────────────────────────────────────────────┤
│  Footer                                                     │
└─────────────────────────────────────────────────────────────┘
```

**Favorite hero card** — full-width on mobile, `grid-cols-2` or `-3` on desktop depending on count. Uses the **featured card variant** from [theme.md](theme.md): `surface-card border-primary/40 bg-primary/[0.03]` with the always-visible violet hairline along the top edge. Displays large free-spaces number (`font-heading font-bold tabular-nums`), oversized status gauge, name, address, open/closed badge, and a primary "View details" pill button (`Button` default + `rounded-full` override).

**Standard card** — uses the **hover-elevated surface card** recipe from [theme.md](theme.md): `surface-card rounded-xl border-border/70` with the 2px hover lift, violet glow, and fading top hairline. Inside: name (`font-heading font-semibold tracking-tight`), address (`text-xs text-muted-foreground`), badges (status, LEZ, type — all `rounded-4xl` pills), gauge, free-spaces count, percent. Star toggle in the corner (icon-button, `text-primary` when active); disabled state with tooltip when at 3-favorite capacity.

**List view (TanStack Table)** — columns: Favorite ★, Name, Status, Free spaces, % free (with inline mini-bar using `--chart-1`), LEZ, Type, Address. Header cells use `font-heading`, rows alternate via `data-[state=hover]:bg-muted/40`. Click-to-sort headers wired to the same `sort` URL state. Row click → detail page.

**Availability gauge** — a single reusable `<AvailabilityGauge percent={n} />` component built on the **Status gauge** SVG ring from [theme.md](theme.md) (rotation `-90deg`, radius 15.5, circumference 97.39, track at `oklch(1 0 0 / 0.07)`). Stroke + drop-shadow glow follow the green/amber/red ratio rule (>50 / 20–50 / <20). Used at `size-10` in standard cards/rows and `size-20` in hero cards.

## Auto-refresh control

- Default: **on, 60 s**.
- Dropdown options: `30 s`, `1 min`, `5 min`, `Off`.
- `Refresh now` button always available; triggers `router.refresh()` and resets the interval clock.
- Selected interval persists to localStorage (`parking.refreshIntervalMs`) so the user's preference survives reloads — not URL-stated because it's a personal device setting.
- Pauses while tab is hidden; resumes (with an immediate tick if more than one interval has elapsed) on visibility regain.

## Filters

Concrete facets, all derived from the dataset and exposed as multi-select chip groups in a single Filters popover (shadcn `popover` + `command`/`checkbox`):

- **Status** — Open, Closed (from `isopennow`).
- **LEZ** — Inside LEZ, Outside LEZ (from `categorie` / equivalent field — confirmed during dataset probe).
- **Type** — values from `type` field (e.g. underground, surface — populated dynamically from the response).
- **Availability** — Available, Almost full, Full (derived from `freePercent` bucket).

A "Clear all" action resets every facet. Active filter count rendered as a badge on the Filters button.

## shadcn/ui components

**Forms (onboarding + profile)**
- `form`, `input`, `label`, `button`

**Overview**
- `card`, `input` (search), `select` (sort, view, refresh interval), `popover` + `command` + `checkbox` (filters), `badge` (open/closed, LEZ, type), `button` (favorite, refresh-now), `toggle-group` (cards/list view switch), `skeleton` (loading), `tooltip` (favorite cap message)

**Detail**
- `card`, `badge`, `button`

**Cross-cutting**
- `sonner` — toast feedback for save/delete/errors and favorite cap
- `alert-dialog` — confirm "Remove all my data" on profile page

**Install**
```bash
pnpm dlx shadcn@latest add form input label button card select badge skeleton sonner alert-dialog popover command checkbox toggle-group tooltip
pnpm add zod react-hook-form @hookform/resolvers nuqs @tanstack/react-table tw-animate-css recharts class-variance-authority clsx tailwind-merge
```

Lucide icons (already a dep): `Star`, `MapPin`, `Clock`, `ExternalLink`, `Search`, `RefreshCw`, `LayoutGrid`, `List`, `SlidersHorizontal`, `User`, `Trash2`.

Note: `recharts` is pulled in per the theme stack — the availability gauge itself is hand-rolled SVG (cheaper, single-ring), but `recharts` is useful if the detail page grows an occupancy-over-time mini-chart in polish time.

## Theme — dark oklch, violet accent

The full visual system lives in [theme.md](theme.md). The plan adopts it wholesale — drop the file's `globals.css`, `components.json`, fonts, and `cn` helper into the project verbatim. The summary below is just enough to brief future-me without re-reading the spec.

**Stack additions** (everything else already in [theme.md](theme.md)):
- Tailwind v4 (CSS-first, no `tailwind.config.js`).
- `tw-animate-css` for shadcn animation primitives.
- shadcn `style: "radix-vega"`, `baseColor: "neutral"`, CSS variables on.
- Fonts via `next/font/google`: **Geist** → `--font-heading`, **Raleway** → `--font-sans`, **Geist Mono** → `--font-mono`. Body uses `font-sans`, headings/numerals use `font-heading`.
- Toaster mounted once at root, `position="top-center"`.

**Palette (oklch, dark-only).** Background ≈ `oklch(0.23 0.005 280)`, cards `oklch(0.275 0.006 280)`, foreground `oklch(0.965 0.002 280)`, primary violet `oklch(0.6 0.155 273)`. Borders are alpha-on-white (`oklch(1 0 0 / 12%)`) so they show through any tinted surface — never hard-code grey. Full table in [theme.md](theme.md#color-tokens-oklch).

**Radius scale.** Base `--radius: 0.5rem`. Cards `rounded-xl`, buttons `rounded-md`, pills (badges, primary CTAs in this app) `rounded-4xl`. Full multipliers in [theme.md](theme.md#radius-scale).

**Status semantic colors** (used by the availability gauge, not registered as tokens):
- Good `>50%` → `oklch(0.72 0.17 142)` (green) + matching `drop-shadow`.
- Warn `20–50%` → `oklch(0.75 0.16 70)` (amber).
- Bad `<20%` → `oklch(0.66 0.21 25)` (red).

**Rules of thumb (lifted from [theme.md](theme.md#design-conventions))**
- **Borders are alpha-on-white** — don't hardcode grey.
- **Tone surfaces with alpha primary** (`bg-primary/[0.03]`, `bg-primary/15`, `ring-primary/25`) for selection/featured state.
- **Hover effects** = tiny lift (`hover:-translate-y-0.5`) + tinted border + colored shadow glow, ≈300 ms duration.
- **Numerals are tabular** (`tabular-nums`) so live counters don't jitter when the auto-refresh tick lands.
- **Focus rings** are `ring-3 ring-ring/50` plus `border-ring`.
- **No emojis in UI** — `lucide-react` only, at `size-3` / `size-3.5` / `size-4`.
- **Density** — section gutters `px-6 max-w-7xl mx-auto`; cards `p-5` outer, `gap-2.5` interior; chips `gap-1.5`.

**Tailwind v4 specifics** worth keeping in mind while building: `bg-linear-to-r` (not `bg-gradient-to-r`), `size-*` shorthand, numeric `ring-3`, `group/<name>` scoped groups, `data-[size=sm]:…` / `aria-expanded:…` variants.

## URL state with nuqs

- Wrap root layout in `<NuqsAdapter>` (App Router adapter from `nuqs/adapters/next/app`).
- Overview client component:
  ```ts
  const [q, setQ] = useQueryState('q', { defaultValue: '', clearOnDefault: true });
  const [sort, setSort] = useQueryState(
    'sort',
    parseAsStringEnum(['name-asc','name-desc','spaces-asc','spaces-desc','percent-asc','percent-desc']).withDefault('name-asc')
  );
  const [view, setView] = useQueryState(
    'view',
    parseAsStringEnum(['cards','list']).withDefault('cards')
  );
  const [status, setStatus] = useQueryState('status', parseAsArrayOf(parseAsString).withDefault([]));
  const [lez, setLez] = useQueryState('lez', parseAsArrayOf(parseAsString).withDefault([]));
  const [type, setType] = useQueryState('type', parseAsArrayOf(parseAsString).withDefault([]));
  const [bucket, setBucket] = useQueryState('bucket', parseAsArrayOf(parseAsString).withDefault([]));
  ```
- Server component for `/` reads `searchParams` (typed via `Promise<{ ... }>` per Next 16) for first paint, then nuqs takes over on the client to keep URL ↔ UI in sync without re-fetching.
- Tests: render the overview inside `<NuqsTestingAdapter>` to assert URL state changes.

## Testing

**Stack:** Vitest + React Testing Library + jsdom. Lighter than Jest, native ESM, plays well with Next 16 / React 19.

**Coverage**
- `lib/profile.ts` — save/load/clear, SSR-safe guard, schema rejection of bad payloads.
- `lib/favorites.ts` — toggle, ordering preserved, 3-item cap enforced, schema rejection.
- `lib/parkings.ts` — response normaliser (open/closed logic, address shape, free-spaces math, percent + bucket derivation), sort comparators, search filter, filter predicate.
- `lib/use-auto-refresh.ts` — fake-timer test: tick fires at the configured interval, pauses when `document.hidden`, `refreshNow()` resets the clock.
- **Component tests**
  - Onboarding form: validation, submit persists, hidden when profile exists.
  - Overview: sort dropdown reorders, search filters, filter chips narrow the list, favorite pins to top, cap surfaces a toast at 4th add, view toggle switches card↔list, URL state syncs (via `NuqsTestingAdapter`).
  - List view: TanStack column sorting flips the URL `sort` param.
  - Profile page: edit updates store, delete clears + redirects.
- Detail page: smoke test that all required fields render from a fixture.
- Error/not-found pages: render-and-recover smoke tests.

## Build order

1. **~15m** Dataset shape probe (curl) — confirm fields for filters + detail page. Write zod schemas, fetchers, derived helpers.
2. **~15m** Vitest config (jsdom, RTL, one passing smoke test).
3. **~15m** Theme — drop [theme.md](theme.md)'s `globals.css`, `components.json`, and `cn` helper into the project; wire Geist + Raleway + Geist Mono in `app/layout.tsx`; verify dark canvas + violet primary render correctly with a throwaway `<Button>`.
4. **~15m** Root layout: `NuqsAdapter`, font variables on `<html>`, `<Toaster position="top-center" />`, `<SiteHeader />` (translucent + blur, tinted wordmark chip, profile pill), `<SiteFooter />` (scher.eu credit), global `error.tsx` + `not-found.tsx`.
5. **~25m** Profile layer + tests.
6. **~25m** Onboarding form + tests.
7. **~20m** Favorites layer + tests.
8. **~20m** `<AvailabilityDial />` + auto-refresh hook + tests.
9. **~45m** Overview: nuqs state, hero favorite strip, standard card grid, search/sort/filters, view toggle, refresh control + `loading.tsx` / `error.tsx`.
10. **~25m** List view via TanStack Table (shares filter/sort state with the URL).
11. **~25m** Profile page + tests.
12. **~30m** Detail page + map embed + segment-level `loading.tsx` / `error.tsx` / `not-found.tsx` + smoke test.
13. **~15m** Polish — empty states, accessibility pass, responsive sweep.
14. **Buffer** for whatever bites.
