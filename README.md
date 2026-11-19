# Ghent Parking

Live availability for Ghent's parking garages, built on the city's open data feeds. Open it, see where there's space, and get a short-term forecast of how that will change before you arrive. No sign-up, no personal data.

Originally a technical-interview take-home ([ASSIGNMENT.md](ASSIGNMENT.md)); since reworked into a public tool. The original plan is in [PLAN.md](PLAN.md), the visual system in [THEME.md](THEME.md).

## Features

- **Overview built for "where can I park?"** — headline stats (open garages, garages with space, total free spaces, the emptiest garage), sorted by most free spaces by default, with closed or no-data garages pushed to the bottom ([components/parking-overview.tsx](components/parking-overview.tsx), sorting in [lib/parkings.ts](lib/parkings.ts)).
- **Map view** — every garage on one map with its live free-space count, coloured by availability ([components/parking-map.tsx](components/parking-map.tsx), Leaflet + OpenStreetMap).
- **Search by destination** — "Where are you going?" sorts the garages by walking distance to a place, with an estimated walking time on every card ("340 m · ~6 min walk") and the destination pinned on the map. About 40 well-known Ghent places (Gravensteen, Vooruit, the hospitals, the stations …) are suggested instantly while typing, also by their English, French and older names; anything else, such as a street address, is looked up on OpenStreetMap when asked. The result is part of the URL, so "parking near Vooruit" can be shared — see [Destination search](#destination-search).
- **Recent destinations** — the last four destinations picked are offered first next time, with a link to forget them. Stored in the browser only ([lib/recent-destinations.ts](lib/recent-destinations.ts)).
- **A straight answer** — with a destination or "Near me", a "Best choice" panel names one garage: the nearest, unless it is closed, full, down to a few spaces, forecast to be full within half an hour, or without a reliable count. When it passes over the nearest garage it says which one and why. It also names the nearest Park & Ride, links to the walking route from the suggested garage to the destination, and says which street-parking zone the destination is in ([lib/recommend.ts](lib/recommend.ts)).
- **Every public car park, not only the ones with a count** — the 13 Park & Ride lots and five more garages (Kouter, Zuid, Center parking, Leopoldskazerne, Zuiderpoort) publish no live numbers. They are listed in their own section and on the map, clearly marked "no live count", each with its own page — see [More than the live feed](#more-than-the-live-feed).
- **Park & Ride, free parking, EV charging** — badges on cards and garage pages, and filters for each. A garage page shows how many charge points it has and the city's own remark about the garage.
- **Where did I park?** — "I parked here" on any car park page remembers the car park, the time and an optional note (level, row). The overview then opens with a reminder and a walking route back. Stored in the browser only, dropped after a week ([lib/parked.ts](lib/parked.ts)).
- **Parked on the street** — the car icon in the header opens "Where did I park?" (`/parked`), where "Save where I am now" pins the car from the phone's position. The page then shows it on a map, the walking route back, which street-parking zone it is in, and the temporary parking bans the city has granted around it for the coming week (removal vans, construction vehicles) — see [Straight from the browser](#straight-from-the-browser).
- **Onward from a Park & Ride** — a Park & Ride page links to the route into the centre by public transport or by bike, names the nearest bus and tram stops, and shows how many shared bikes (Donkey Republic, Dott, Bolt) stand within 400 m right now.
- **When the ticket runs out** — on "Where did I park?" a time can be set for the ticket or parking disc. The page and the overview reminder count down to it and turn amber from a quarter of an hour before. "Add a reminder to my calendar" downloads a calendar event with an alert ten minutes before, so the phone's own calendar reminds the visitor while this site is closed ([lib/ics.ts](lib/ics.ts)).
- **Share the spot** — "Share this spot" sends a link to whoever came along: to the car park's page, or for a spot on the street to `/parked?spot=<lat>,<lng>`, which shows the pin and the walking route and can be saved as the receiver's own spot.
- **Nearest pay machine** — for a spot on the street, with whether it takes cash (nearly all of Ghent's machines don't).
- **Nearby alternatives** — a garage page lists up to three other garages with space within 2.5 km; when the garage itself has no space the section is titled "No space here? Try nearby".
- **How to drive in** — the garage map shows the city's recommended routes between the ring road (R40) and the garage as blue lines, for the eleven garages in the centre that have them. Ghent's circulation plan closes many other streets to through traffic ([lib/approach-routes.ts](lib/approach-routes.ts)).
- **Charge points on the map** — a "Charge points" button on the overview map shows every public charge point for electric cars in the city (about 1,160 sockets), fast chargers in a different colour.
- **Works offline** — the pages a phone has already seen open without a connection, for example in an underground garage, with a notice saying how old the copy is — see [Offline](#offline).
- **Low-emission zone** — garages inside the zone say so, with a link to the city's rules and vehicle check.
- **Near me** — optional browser geolocation to sort by distance and show how far each garage is. The location stays in memory, is never stored, and is never sent anywhere ([lib/use-geolocation.ts](lib/use-geolocation.ts)).
- **Open with space** quick filter, plus search by name or street and status / LEZ / type / availability filters, all synced to the URL so any view is shareable.
- **Short-term forecast** on cards ("~120 free in 30 min", "Likely full in ~20 min") and a 60-minute forecast with ranges on detail pages — see [Forecasting](#forecasting).
- **Favorites** — pin up to 3 garages to the top (stored only in the browser).
- **Detail pages** — opening hours, operator, LEZ, a map of the garage, navigation via Google Maps / Waze / Apple Maps, call, share.
- **Light and dark** — the settings menu switches between the dark theme (the default, as the site has always looked), a light one for reading outdoors, and "same as this device". The choice is kept in the browser; the map follows it ([components/theme-provider.tsx](components/theme-provider.tsx), colours in [app/globals.css](app/globals.css)).
- **Your choice of map** — garage pages show an OpenStreetMap map by default, so nothing is loaded from Google. Visitors who prefer Google Maps can switch in the settings menu (the gear in the header) or with the link under the map; the choice is remembered in their browser ([lib/map-provider.ts](lib/map-provider.ts)).
- **Auto-refresh** — visibility-aware polling (default 60 s) with manual refresh; the spinner runs for as long as the request actually takes.
- **Honest data age** — "City data updated 2 min ago" comes from the feed's own timestamps, not from when the page last asked. A garage whose count is more than 30 minutes old gets a warning and loses its forecast, and if no garage has updated for 15 minutes a banner says the feed has stopped ([lib/freshness.ts](lib/freshness.ts)).
- **Live-data warning** when a garage returns `-1` free spaces, and a clear message when the feed is down.
- **Its own history** — a scheduled job saves every garage's count every 10 minutes, because the city only publishes the last few hours — see [Our own history archive](#our-own-history-archive).
- **A typical day** — a garage page shows how much room there usually is, hour by hour, for today's day of the week or any other ("A typical Saturday"), with the hours that usually have the most and the least room. Worked out from the site's own history, so it fills in as the weeks go by — see [The weekly pattern](#the-weekly-pattern).
- **For AI assistants** — an MCP server at `/api/mcp` lets an assistant such as Claude ask where to park: live counts, the best garage for a destination, one garage in detail, and what is usual at a given hour of the week. The page `/mcp` (linked in the footer) explains to visitors how to connect it — see [MCP server](#mcp-server).
- **Five languages** — Dutch, English, French, German and Spanish; every page exists under `/nl`, `/en`, `/fr`, `/de` and `/es`. A first visit picks the browser's language (Dutch if it's none of the five), the choice is remembered, and the language menu in the header keeps your search, sort, filters and destination — see [Languages](#languages).
- **Installable on a phone** — "Add to Home Screen" opens it in its own window under a parking-sign icon, with long-press shortcuts to *Garages with space*, *Map* and *Where did I park?* ([app/manifest.ts](app/manifest.ts)). The settings menu offers "Install on this device" where the browser supports it, and explains the Share-menu route on iPhone and iPad ([lib/use-install-prompt.ts](lib/use-install-prompt.ts)). Shared links get a preview card, and search engines get a sitemap of every garage page.

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

- **Where the text lives:** one file per language in [messages/](messages) (`nl.json`, `en.json`, `fr.json`, `de.json`, `es.json`). Components never contain user-facing text; they look it up with `useTranslations("namespace")`.
- **Routing:** [i18n/routing.ts](i18n/routing.ts) lists the languages and the default (Dutch). [proxy.ts](proxy.ts) redirects URLs without a language prefix, so old links such as `/parkings/parking-reep` keep working.
- **Links:** use `Link` and `useRouter` from [i18n/navigation.ts](i18n/navigation.ts), not from `next/link`, so navigation stays in the visitor's language.
- **Numbers, times and distances** follow the language too (`4.974` vs `4,974`, `1,3 km` vs `1.3 km`). Times are always Ghent time.
- **Search engines** get `hreflang` links between the language versions of each page, in the page head and in the sitemap, and one share image per language.
- **Not translated:** garage names, addresses, opening hours and descriptions come straight from the city's feed, in Dutch. The web manifest (install name and shortcuts) has a single language and uses Dutch.

**Adding a language** takes two steps, both checked by `pnpm test`:

1. In [i18n/routing.ts](i18n/routing.ts), add its code to `locales` and a row to `LOCALE_INFO` (its own name for the menu, and its code for share previews).
2. Copy `messages/en.json` to `messages/<code>.json` and translate it. The test fails if the file is missing, lacks a message, or uses different `{placeholders}` than the English one.

Optionally add the language's names for well-known places as aliases in [lib/destinations.ts](lib/destinations.ts) ("Rathaus", "ayuntamiento"), so the destination search finds them.

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

## More than the live feed

The live feed has 15 garages. Four more of the city's datasets fill in the rest:

| Dataset | Used for | Reused for |
| --- | --- | --- |
| `locaties-openbare-parkings-gent` | All 37 public car parks: the 18 that the live feed doesn't cover, plus Park & Ride marks and the city's remarks for the ones it does | 24 h |
| `laadpalen-gent` | Charge points that stand inside a car park (about 90), counted per garage | 24 h |
| `parkeertariefzones-gent` | Which street-parking zone a destination is in | 24 h |
| `aanrijroutes-gent` | The recommended streets between the ring road and a garage, drawn on the garage map | 24 h |

- **Matching** ([lib/directory.ts](lib/directory.ts)): a directory entry is a garage we already have live when its pin is within 110 m of a live garage, or when the names match ("Dok Noord", and "The Loop C" under the feed's single "The Loop"). Kouter and Savaan are different garages 150 m apart, which is why distance alone isn't enough the other way round.
- **Charge points** ([lib/chargers.ts](lib/chargers.ts)) are counted once each, for the nearest car park within 120 m.
- **Free or paid** is only shown where the data says so: the live feed's "free" flag, or a city note that starts "P+R gratis" or "Parking betalend". Otherwise the app says nothing.
- **Street zones** ([lib/street-zones.ts](lib/street-zones.ts)): the outlines (about 300 KB) stay on the server; the browser asks `/api/street-zone?at=<lat>,<lng>` and gets one colour back. The rates themselves are not in the data, so the app names the zone and links to the city's page.
- **Routes** ([lib/approach-routes.ts](lib/approach-routes.ts)): the data is a set of road segments labelled with what they connect ("R40 FT" → "P Sint Michiels, P Ramen"). A two-way street carries both directions in one record, so the app shows the streets that serve a garage without claiming which direction is "in".
- **The charge-point map layer** uses the full `laadpalen-gent` list, grouped per post, and is only fetched (`/api/chargers`) when a visitor switches the layer on.
- All of these are optional. If one fails, the live garages are shown as before, and the failing list is retried once a minute rather than on every page view.

## Straight from the browser

Some questions have a different answer for every visitor and every minute, so there is nothing to cache on a server. For those the visitor's browser asks the city's open data portal itself; the portal allows that from any site. Nothing runs on our server for them.

- **Shared bikes near a Park & Ride** ([lib/shared-bikes.ts](lib/shared-bikes.ts), [components/onward-travel.tsx](components/onward-travel.tsx)): three requests, one per operator, for the bikes within 400 m. Donkey Republic publishes stations with a count; Dott and Bolt publish each bike. Reserved and disabled bikes, and stations that aren't renting, are left out. An operator whose feed doesn't answer is simply not shown.
- **Temporary parking bans around a car on the street** ([lib/parking-bans.ts](lib/parking-bans.ts), [components/parking-bans-note.tsx](components/parking-bans-note.tsx)): the city's granted bans within 75 m that are running now or start within seven days, nearest first. The data locates a ban by the middle of its stretch of street and a phone's position is easily 20 m off, so the list says "nearby", gives the distance, and always adds that the signs in the street decide. When the request fails the section stays empty rather than say "no bans".
- **Bus and tram stops near a Park & Ride** ([lib/transit-stops.ts](lib/transit-stops.ts)): the four nearest stops within 400 m that a bus or tram calls at, one line per stop name.
- **The nearest pay machine to a car on the street** ([lib/pay-machines.ts](lib/pay-machines.ts)): the nearest machine in service within 250 m.
- **Privacy:** these requests carry the coordinates of the car park or of the saved spot, and the visitor's IP address, to the city's portal, as opening the city's own maps would. The street-parking zone of a saved spot is looked up through this site's own `/api/street-zone`. The saved spot itself (time, note) never leaves the browser.

## Offline

[public/sw.js](public/sw.js) is a small hand-written service worker, registered by [components/offline-notice.tsx](components/offline-notice.tsx) (not in development).

- **Online, nothing changes.** Pages always come from the network first. API calls and Next.js data requests are never cached; only static files with a content hash in their name are.
- **A saved copy is a fallback**, used when the network fails or a page load hangs for six seconds. Up to 40 pages are kept.
- **A saved copy says so.** The worker tells the page when its copy was saved. A notice under the header reads "Offline copy: this page was saved 2 h ago", and every "updated … ago" label counts from that moment rather than from when the page was opened ([lib/use-now.ts](lib/use-now.ts)), so old counts are never presented as live.
- **The installed app** opens at `/` (and its shortcut at `/parked`), which only redirect to a language; offline they are sent to that page in the language that was saved most recently.
- **A page that was never saved** gets a short offline page in the visitor's language.
- "Where did I park?" lives in the browser's own storage, so the reminder works offline too.

To throw away everything saved by an earlier release, bump `VERSION` in `public/sw.js`.

## Our own history archive

The city publishes only the last ~3 hours of occupancy, and only for nine garages. That is enough for a short-term trend, not for "how full is this garage usually on a Saturday afternoon?". History can't be collected afterwards, so the app keeps its own record ([lib/history-archive.ts](lib/history-archive.ts)):

- **Every 10 minutes** a scheduled job ([vercel.json](vercel.json) → [app/api/cron/snapshot/route.ts](app/api/cron/snapshot/route.ts)) saves the live count of every garage.
- **One text file per UTC day**, one snapshot per line: `history/v1/2026/2026-11-19.jsonl`. About 130 KB a day, under 50 MB a year.
- **Nothing is made up.** If the city feed can't be read, that slot is skipped. A garage without a live count is stored as `null`, not as zero.
- **No lost or duplicate lines.** A second run in the same 10 minutes changes nothing, and a file is only replaced if it is still the version that was read.

One line of a day's file:

```json
{"t":1795089535,"g":{"parking-reep":{"f":212,"c":455,"u":1795089383,"o":1}}}
```

| Key | Meaning |
| --- | --- |
| `t` | When the snapshot was taken (Unix time, seconds) |
| `g` | Readings by garage id, the same id as in `/parkings/<id>` |
| `f` | Free spaces, or `null` when the feed had no live count |
| `c` | Capacity (total spaces) |
| `u` | When the feed last updated this count (Unix time, seconds), or `null` |
| `o` | `1` open, `0` closed |

The archive only collects for now. Showing "usually busy at this hour" and a better forecast come once there are a few weeks of data.

### The weekly pattern

"How full is this garage usually on a Saturday afternoon?" is answered from the archive ([lib/history-profile.ts](lib/history-profile.ts)):

- **One value per garage per hour of the week** (168 hours, Ghent time). Each day counts once per hour (the average of that hour's readings); the usual value is the median over the days of the last four weeks, so one concert night doesn't shift "a typical Thursday".
- **Only real measurements count.** Readings without a count, from a closed garage, or from a count the feed stopped updating are left out.
- **It says how much it is based on.** Every value carries the number of days behind it ("measured on 1 day so far"), and the page says since when the site has been measuring.
- **Built once a night, not on page views.** The scheduled job that saves the snapshots also reads the last 29 day files (today and the 28 days before) on its first run of the UTC day (and once more at 03:00) and saves the result as one small file, `history/v1/profile.json` (about 15 KB) ([lib/history-profile-store.ts](lib/history-profile-store.ts)). That is about 60 extra storage operations a day (29 day files read twice a night), next to the 288 the snapshots already use.
- **Pages only read that one file.** `/api/typical` serves it and the CDN keeps it for six hours; a server instance reads it from storage at most once every three hours.
- **To build it right away** (after the first deploy, or after changing the calculation), call the job with `?profile=1`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-domain>/api/cron/snapshot?profile=1"
```

### Switching it on

The archive is off until storage is configured; the rest of the app is unaffected.

| Variable | Set by | Purpose |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel, when a (private) Blob store is connected to the project | Where the files are kept |
| `CRON_SECRET` | You, in the project's environment variables | Vercel sends it with every scheduled call; the route refuses anything else |
| `HISTORY_ARCHIVE_DIR` | You, optional | Keep the files in a local folder instead (development, self-hosting) |

On Vercel, scheduled jobs only run on the production deployment. To try it locally:

```bash
HISTORY_ARCHIVE_DIR=.data CRON_SECRET=dev pnpm dev
```

```bash
curl -H "Authorization: Bearer dev" http://localhost:3000/api/cron/snapshot
```

Usage on Vercel, per month: about 4,300 scheduled calls, 4,300 file writes, 4,300 file reads and roughly 300 MB read back from storage. That is small next to what a Pro plan includes for Blob, but check Vercel's current Blob pricing before relying on that.

## MCP server

`/api/mcp` is an [MCP](https://modelcontextprotocol.io) server ("Streamable HTTP"), so an AI assistant can use this site's data and rules directly ([app/api/mcp/route.ts](app/api/mcp/route.ts), [lib/mcp-tools.ts](lib/mcp-tools.ts)). No key: everything it returns is public data.

| Tool | What it answers |
| :--- | :--- |
| `list_garages` | Every car park with its live free spaces, forecast and facts (Park & Ride, free, EV charging). `only_with_space` narrows it to garages known to have room. |
| `find_parking` | The best garage for a destination: a well-known place by name, or coordinates. Says why the nearest was passed over, lists other garages with space and the nearest Park & Ride. |
| `get_garage` | One car park in detail: live count, forecast, what is usual at this hour, opening hours, position, the city's remark. |
| `typical_availability` | Planning ahead: how many spaces are usually free in each garage at an hour of the week (`weekday`, `hour`). |

- **To connect:** add `https://<your-domain>/api/mcp` as a custom connector in the assistant (in Claude: Settings → Connectors → Add custom connector).
- **Same rules as the website.** A count that is missing or more than 30 minutes old is marked as such and gets no forecast; "best choice" uses the same rules as the panel on the overview.
- **Stateless.** Each request is answered on its own with plain JSON: no sessions, no open connections. One call is one function run and reads the same cached feeds as the pages.
- **Street addresses** are not looked up here: the assistant passes coordinates for anything that isn't one of the well-known places.
- **Limits:** request bodies over 64 KB are refused. There is no rate limit; the endpoint is public, like the pages.

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
- **@modelcontextprotocol/sdk** for the MCP endpoint
- **lucide-react** for icons
- **Vercel Blob** + a Vercel cron job for the history archive
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
| `pnpm typecheck`   | Check the TypeScript types            |
| `pnpm test`        | Run the Vitest suite once             |
| `pnpm test:watch`  | Run Vitest in watch mode              |

Every pull request, and every push to `master`, runs lint, the type check, the tests and a production build on GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Project layout

```
app/                          App Router routes
  [locale]/                   Everything a visitor sees, per language
    layout.tsx                Root layout: <html lang>, providers, metadata
    page.tsx                  Overview (server)
    parkings/[id]/            Detail page (server) + loading / error / not-found
    parked/page.tsx           "Where did I park?"
    mcp/page.tsx              How to connect an AI assistant (MCP)
    opengraph-image.tsx       Share preview card, one per language
    [...rest]/page.tsx        Translated "page not found" for unknown paths
  api/cron/snapshot/route.ts  Scheduled job: save the current counts to the archive
  api/street-zone/route.ts    Which street-parking zone a spot is in
  api/chargers/route.ts       Every public charge point, for the map layer
  api/typical/route.ts        The weekly pattern, for the browser
  api/mcp/route.ts            MCP server for AI assistants
  manifest.ts                 Web app manifest (name, icons, shortcuts)
  icon.svg, apple-icon.png    App icon (source artwork: icon.svg)
  sitemap.ts, robots.ts       For search engines (previews are not indexed)
i18n/                         Language list, language-aware links, request setup
messages/                     Translations: one JSON file per language
proxy.ts                      Language detection and redirects
vercel.json                   Schedule for the history snapshot (every 10 minutes)
.github/workflows/ci.yml      Checks run on every pull request
components/                   UI building blocks
  parking-overview.tsx        Overview client shell (summary / search / sort / filter / view)
  parking-map.tsx             Leaflet map of all parkings (client-only)
  forecast-hint.tsx           One-line forecast for cards / list / map
  destination-search.tsx      "Where are you going?" box with suggestions
  destination-advice.tsx      "Best choice" panel for a destination or "Near me"
  street-zone-note.tsx        Street-parking zone at the destination
  extra-parking-card.tsx      Card for a car park without a live count
  extra-parking-detail.tsx    Page for a car park without a live count
  facility-badges.tsx         Park & Ride / free / EV charging badges
  parking-facilities.tsx      Price, Park & Ride, charging and the city's note on a page
  parked-here.tsx             "I parked here" and the reminder on the overview
  parked-page.tsx             "Where did I park?": the saved spot, or save one on the street
  parked-link.tsx             The car icon in the header
  theme-provider.tsx          Light / dark / same as device
  copy-field.tsx              A value with a copy button
  parking-bans-note.tsx       Temporary parking bans around a spot on the street
  onward-travel.tsx           Routes to the centre and shared bikes near a Park & Ride
  offline-notice.tsx          Registers the service worker; "you are looking at a saved copy"
  language-switcher.tsx       Language menu in the header
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
  directory.ts                The city's list of all public car parks, matched to the live feed
  chargers.ts                 Charge points inside car parks
  street-zones.ts             Street-parking zones and "which zone is this spot in?"
  approach-routes.ts          Recommended driving routes between the ring road and a garage
  recommend.ts                Best garage for a point, nearest Park & Ride, nearby alternatives
  parked.ts                   Where the visitor parked (localStorage)
  recent-destinations.ts      The last destinations picked (localStorage)
  use-install-prompt.ts       "Install this app" where the browser offers it
  history-profile.ts          The weekly pattern: usual free spaces per hour of the week
  history-profile-store.ts    Building and reading that pattern (server)
  mcp-tools.ts                What the MCP endpoint answers with
  parking-bans.ts             The city's temporary parking bans near a spot
  pay-machines.ts             The nearest on-street pay machine
  transit-stops.ts            Bus and tram stops near a spot
  ics.ts                      Calendar file with an alert (ticket reminder)
  use-city-data.ts            One browser request to the city's open data
  shared-bikes.ts             Shared bikes near a spot; routes to the centre
  history-archive.ts          Our own history: snapshot format, day files, append
  archive-store.ts            Where the archive lives: Vercel Blob, a folder, or memory
  cron-auth.ts                Checks that a scheduled call really comes from Vercel
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
- [`locaties-openbare-parkings-gent`](https://gent.opendatasoft.com/explore/dataset/locaties-openbare-parkings-gent/) — every public car park: addresses for the live garages, and the Park & Ride lots and garages that have no live count.
- [`laadpalen-gent`](https://gent.opendatasoft.com/explore/dataset/laadpalen-gent/) — public charge points; the ones inside a car park are counted per garage.
- [`parkeertariefzones-gent`](https://gent.opendatasoft.com/explore/dataset/parkeertariefzones-gent/) — the street-parking zones.
- [`aanrijroutes-gent`](https://gent.opendatasoft.com/explore/dataset/aanrijroutes-gent/) — the recommended driving routes to the garages in the centre.
- `recente-bezetting-parking-<name>-gent` — per-garage recent-occupancy series powering the detail-page history chart (only published for a subset of garages).

The three Interparking garages (Kouter, Zuid, Center) have no live count. Their numbers used to come from a separate `mobi-parkings` dataset, which is no longer on the portal (checked November 2026). They are listed from the directory instead, without a count.

## Credits

Built by Pieter-Jan Scheir — [scheir.eu](https://scheir.eu).
Data courtesy of [stad.gent open data](https://gent.opendatasoft.com).
