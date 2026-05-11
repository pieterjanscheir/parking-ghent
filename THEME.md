# Theme & Styling Reference

A portable spec of the visual system used in this app. Drop these tokens and conventions into another project (Next.js + Tailwind v4 + shadcn) to match the look.

## Stack

- **Framework:** Next.js 16 + React 19
- **Styling:** Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`)
- **Animations:** `tw-animate-css`
- **Components:** shadcn (style `radix-vega`, base color `neutral`, CSS variables on)
- **Headless primitives:** `radix-ui`, `@base-ui/react`
- **Icons:** `lucide-react`
- **Class utilities:** `clsx`, `tailwind-merge`, `class-variance-authority`
- **Toasts:** `sonner`
- **Charts:** `recharts`

Install:

```bash
pnpm add tailwindcss@^4 tw-animate-css class-variance-authority clsx tailwind-merge lucide-react radix-ui sonner
pnpm add -D @tailwindcss/postcss
```

## Mode

Dark-only by default. `color-scheme: dark` is forced on `<html>`. A `.dark` variant exists (`@custom-variant dark (&:is(.dark *))`) but no light palette is defined.

## Color tokens (oklch)

All colors are defined in `oklch()` for perceptual uniformity. The hue family is a desaturated cool neutral (≈280) with a violet/indigo accent (~273).

| Token | Value | Use |
|---|---|---|
| `--background` | `oklch(0.23 0.005 280)` | App background |
| `--foreground` | `oklch(0.965 0.002 280)` | Primary text |
| `--card` | `oklch(0.275 0.006 280)` | Card surfaces |
| `--card-foreground` | `oklch(0.965 0.002 280)` | Text on cards |
| `--popover` | `oklch(0.30 0.006 280)` | Popovers, menus |
| `--popover-foreground` | `oklch(0.965 0.002 280)` | Text in popovers |
| `--primary` | `oklch(0.6 0.155 273)` | Brand / interactive accent (violet-indigo) |
| `--primary-foreground` | `oklch(0.99 0.002 280)` | Text on primary |
| `--secondary` | `oklch(0.32 0.007 280)` | Subdued surfaces |
| `--secondary-foreground` | `oklch(0.965 0.002 280)` | Text on secondary |
| `--muted` | `oklch(0.305 0.006 280)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.70 0.008 280)` | Secondary text |
| `--accent` | `oklch(0.35 0.01 280)` | Hover / accent surfaces |
| `--accent-foreground` | `oklch(0.965 0.002 280)` | Text on accent |
| `--destructive` | `oklch(0.66 0.21 25)` | Errors / danger (red-orange) |
| `--border` | `oklch(1 0 0 / 12%)` | Hairlines via white alpha |
| `--input` | `oklch(1 0 0 / 15%)` | Input borders |
| `--ring` | `oklch(0.6 0.155 273)` | Focus rings (= primary) |
| `--sidebar` | `oklch(0.25 0.005 280)` | Sidebar surface |
| `--sidebar-foreground` | `oklch(0.965 0.002 280)` | Sidebar text |
| `--sidebar-primary` | `oklch(0.6 0.155 273)` | Sidebar accent |
| `--sidebar-primary-foreground` | `oklch(0.99 0.002 280)` | Text on sidebar accent |
| `--sidebar-accent` | `oklch(0.32 0.007 280)` | Sidebar hover |
| `--sidebar-accent-foreground` | `oklch(0.965 0.002 280)` | Text on sidebar hover |
| `--sidebar-border` | `oklch(1 0 0 / 12%)` | Sidebar hairline |
| `--sidebar-ring` | `oklch(0.6 0.155 273)` | Sidebar focus ring |

### Chart palette

| Token | Value | Hue family |
|---|---|---|
| `--chart-1` | `oklch(0.6 0.155 273)` | violet (primary) |
| `--chart-2` | `oklch(0.7 0.14 200)` | cyan |
| `--chart-3` | `oklch(0.75 0.16 70)` | amber |
| `--chart-4` | `oklch(0.6 0.2 305)` | magenta |
| `--chart-5` | `oklch(0.7 0.2 16)` | red-orange |

### Status / semantic colors (used inline, not as tokens)

The parking card gauge picks colors by ratio — reuse this convention for status indicators:

| State | Color | Glow |
|---|---|---|
| Good (>50%) | `oklch(0.72 0.17 142)` (green) | `drop-shadow(0 0 6px oklch(0.72 0.17 142 / 0.5))` |
| Warn (20–50%) | `oklch(0.75 0.16 70)` (amber) | `drop-shadow(0 0 6px oklch(0.75 0.16 70 / 0.5))` |
| Bad (<20%) | `oklch(0.66 0.21 25)` (red) | `drop-shadow(0 0 6px oklch(0.66 0.21 25 / 0.5))` |
| Idle accent | `oklch(0.66 0.19 258)` | `drop-shadow(0 0 6px oklch(0.66 0.19 258 / 0.5))` |

## Radius scale

`--radius: 0.5rem` is the base. Tailwind utilities expose:

| Class | Multiplier | Computed |
|---|---|---|
| `rounded-sm` | 0.6× | 0.30rem |
| `rounded-md` | 0.8× | 0.40rem |
| `rounded-lg` | 1.0× | 0.50rem |
| `rounded-xl` | 1.4× | 0.70rem |
| `rounded-2xl` | 1.8× | 0.90rem |
| `rounded-3xl` | 2.2× | 1.10rem |
| `rounded-4xl` | 2.6× | 1.30rem |

Pills (badges) use `rounded-4xl`. Cards use `rounded-xl`. Buttons use `rounded-md`.

## Typography

Three Google Fonts wired as CSS variables:

```ts
import { Geist, Geist_Mono, Raleway } from "next/font/google";

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" });
const raleway      = Raleway({ subsets: ["latin"], variable: "--font-sans" });
const geistSans    = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono    = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
```

- **Body / UI:** Raleway via `--font-sans` (applied with `font-sans`)
- **Headings:** Geist via `--font-heading` (use `font-heading`)
- **Mono:** Geist Mono via `--font-mono`
- `<html>` gets `antialiased` + `font-sans` + all four font variables.

Typographic conventions:

- Card titles: `font-semibold leading-tight tracking-tight`
- Big numerals: `font-bold leading-none tracking-tight tabular-nums`
- Meta text: `text-xs text-muted-foreground`

## globals.css

Drop this into `app/globals.css` verbatim:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: oklch(0.23 0.005 280);
  --foreground: oklch(0.965 0.002 280);
  --card: oklch(0.275 0.006 280);
  --card-foreground: oklch(0.965 0.002 280);
  --popover: oklch(0.30 0.006 280);
  --popover-foreground: oklch(0.965 0.002 280);
  --primary: oklch(0.6 0.155 273);
  --primary-foreground: oklch(0.99 0.002 280);
  --secondary: oklch(0.32 0.007 280);
  --secondary-foreground: oklch(0.965 0.002 280);
  --muted: oklch(0.305 0.006 280);
  --muted-foreground: oklch(0.70 0.008 280);
  --accent: oklch(0.35 0.01 280);
  --accent-foreground: oklch(0.965 0.002 280);
  --destructive: oklch(0.66 0.21 25);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.6 0.155 273);
  --chart-1: oklch(0.6 0.155 273);
  --chart-2: oklch(0.7 0.14 200);
  --chart-3: oklch(0.75 0.16 70);
  --chart-4: oklch(0.6 0.2 305);
  --chart-5: oklch(0.7 0.2 16);
  --radius: 0.5rem;
  --sidebar: oklch(0.25 0.005 280);
  --sidebar-foreground: oklch(0.965 0.002 280);
  --sidebar-primary: oklch(0.6 0.155 273);
  --sidebar-primary-foreground: oklch(0.99 0.002 280);
  --sidebar-accent: oklch(0.32 0.007 280);
  --sidebar-accent-foreground: oklch(0.965 0.002 280);
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.6 0.155 273);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-sans;
    color-scheme: dark;
  }
  body {
    @apply bg-background text-foreground;
  }
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
  ::selection {
    background-color: oklch(0.6 0.155 273 / 0.4);
    color: oklch(0.99 0.002 280);
  }
}

@layer utilities {
  .gradient-text {
    background: linear-gradient(180deg, oklch(0.99 0.002 280) 0%, oklch(0.78 0.005 280) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }
  .surface-card {
    background-color: var(--card);
    background-image: linear-gradient(180deg, oklch(1 0 0 / 0.015) 0%, transparent 60%);
  }
}
```

## shadcn config (`components.json`)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-vega",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle"
}
```

## `cn` helper

```ts
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Component recipes

These distill the visual conventions used across the app.

### Button (CVA variants)

```ts
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:     "border-border bg-background shadow-xs hover:bg-muted hover:text-foreground",
        secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:       "hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link:        "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-2.5",
        xs:      "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs",
        sm:      "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5",
        lg:      "h-10 gap-1.5 px-2.5",
        icon:    "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

Buttons sink 1px on active press (`active:translate-y-px`). Focus ring is a 3px halo at `ring/50`.

### Badge

- Pill shape: `rounded-4xl`, `h-5`, `text-xs font-medium`.
- Variants: `default` (primary fill), `secondary`, `outline` (border + foreground), `destructive` (10% destructive bg), `ghost`, `link`.

### Card

- `rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10`
- Internal gap `gap-6`, padding `py-6 / px-6`; sm variant uses `gap-4 / py-4 / px-4`.
- Title uses `font-heading` (Geist).

### Hover-elevated surface card (e.g. parking card)

```tsx
<article className="surface-card relative flex flex-col overflow-hidden rounded-xl border border-border/70 text-card-foreground shadow-[0_1px_0_oklch(1_0_0/0.04)_inset] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_0_0_1px_oklch(0.66_0.19_258/0.25),0_18px_40px_-20px_oklch(0.66_0.19_258/0.45)]">
  {/* top hairline that fades in on hover */}
  <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />
  …
</article>
```

Key tricks:
- 1px inset highlight via box-shadow: `shadow-[0_1px_0_oklch(1_0_0/0.04)_inset]`.
- On hover, the card lifts 2px (`hover:-translate-y-0.5`) and gets a violet glow underneath.
- A 1px gradient hairline fades in along the top edge.
- `.surface-card` adds a subtle top-down white fade (1.5% → 0%) to the card background.

### Featured card variant

`border-primary/40 bg-primary/[0.03]` with the violet hairline always visible at `via-primary/80`.

### Sticky translucent header

```tsx
<header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
  …
</header>
```

Logo mark uses a tinted rounded chip:

```tsx
<div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25 group-hover:bg-primary/25 group-hover:ring-primary/40 transition-all">
  <img className="size-4" />
</div>
```

Pill button (e.g. profile chip):

```tsx
<Link className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-sm text-muted-foreground transition-all hover:border-border hover:bg-card hover:text-foreground" />
```

### Status gauge (SVG ring)

```tsx
<svg viewBox="0 0 36 36" className="-rotate-90 size-16">
  <circle cx="18" cy="18" r="15.5" fill="none" stroke="oklch(1 0 0 / 0.07)" strokeWidth="3" />
  <circle
    cx="18" cy="18" r="15.5" fill="none"
    stroke={statusColor}            // green / amber / red per ratio
    strokeWidth="3" strokeLinecap="round"
    strokeDasharray={`${ratio * 97.39} 97.39`}
    style={{ filter: `drop-shadow(0 0 6px ${statusColor}/0.5)` }}
  />
</svg>
```

Circumference `2π·15.5 ≈ 97.39`. Track is white at 7% alpha; foreground stroke gets a colored glow.

## Design conventions

- **Borders are alpha-on-white.** `--border` and `--input` are white at low alpha, so they show through any surface tint. Don't hard-code gray borders.
- **Tone surfaces with alpha primary.** Use `bg-primary/[0.03]`, `bg-primary/15`, `ring-primary/25` to imply selection or featured state without competing with content.
- **Hover effects** combine a tiny lift (`hover:-translate-y-0.5`) with a colored shadow glow and a 1px tinted border. Keep duration ≈300ms.
- **Numerals are tabular** (`tabular-nums`) so live counters don't jitter.
- **Focus rings** are `ring-3 ring-ring/50` plus `border-ring` — the same look across button, badge, and inputs.
- **No emojis in UI.** Icons come from `lucide-react` at `size-3` / `size-3.5` / `size-4`.
- **Semantic ratio coloring** (green > amber > red) is reused for any live-data display, not just parking.
- **Density:** cards `p-5` outer, `gap-2.5` interior; chips `gap-1.5`; section gutters `px-6 max-w-7xl mx-auto`.

## Tailwind classes worth knowing in v4

- `bg-linear-to-r` (replaces v3 `bg-gradient-to-r`).
- `size-*` shorthand (e.g. `size-4` = `h-4 w-4`).
- `ring-3` (numeric ring widths are arbitrary).
- Variant `group/<name>` + `group-hover/<name>:…` to scope groups.
- `data-[size=sm]:…` and `aria-expanded:…` selectors are used heavily in shadcn variants.

## Layout root

```tsx
<html lang="en" className={cn("h-full antialiased", geistSans.variable, geistMono.variable, "font-sans", raleway.variable, geistHeading.variable)}>
  <body className="min-h-full flex flex-col bg-background text-foreground">
    {children}
    <Toaster position="top-center" />
  </body>
</html>
```

`Toaster` (sonner) is mounted once at the root, `position="top-center"`.
