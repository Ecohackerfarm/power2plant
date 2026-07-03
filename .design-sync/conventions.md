# power2plant design system

The power2plant UI primitives (shadcn/ui "base-nova" style, built on `@base-ui/react`)
for the Ecohacker Farm crowdfunding & research platform. Import every component from
the `power2plant` package and compose them with Tailwind utility classes.

## Brand foundations

- **Fonts** — body text is **DM Sans** (`--font-dm-sans`); headings use **Fraunces**
  (`--font-fraunces`, a serif). `CardTitle` and any `font-heading` element render in
  Fraunces; everything else is DM Sans. Both ship in the bundle's `fonts/`.
- **Color** — use semantic token classes, never raw hex: `bg-primary`/`text-primary`
  (soil orange), `secondary` (sage), `muted`/`muted-foreground`, `destructive`,
  `border`, `ring`, `card`/`card-foreground`. These adapt to light/dark.
- **Radius & spacing** follow the token scale (`rounded-lg`/`rounded-xl`); prefer the
  component's built-in sizing props over ad-hoc padding.

## Component conventions

- **Button** — `variant`: `default` (primary CTA), `secondary`, `outline`, `ghost`,
  `destructive`, `link`. `size`: `xs`/`sm`/`default`/`lg` plus `icon`/`icon-xs`/`icon-sm`/`icon-lg`.
  One primary `default` button per action group; pair with `outline`/`ghost` for secondary actions.
- **Badge** — same variant vocabulary as Button (minus sizes). Use for status
  (`Funded`, `In review`), counts, and inline labels. Keep text terse.
- **Card** — compose with `CardHeader` + `CardTitle` (+ optional `CardDescription`,
  `CardAction`), `CardContent`, `CardFooter`. `CardAction` floats to the header's top-right
  (badge or icon button). `CardFooter` gets a muted top-bordered bar — good for primary CTAs.
  `size="sm"` tightens padding/gaps.
- **Input** — always pair with a `Label` (`htmlFor`/`id`). Set `aria-invalid` for the
  error state (destructive ring); add helper text in `text-destructive` below.
- **Label** — a leaf that belongs to a field; render it together with its `Input`.
  Mark required fields with a `text-destructive` asterisk.
- **Separator** — `orientation="horizontal"` (default, full width) or `"vertical"`
  (needs a fixed-height flex row). Divides sections, list rows, and inline nav items.

## Feature components

These two are full app features (the garden planner), not primitives — composed
of the same tokens and primitives above. They render standalone here because the
bundle wraps them in a locale provider, a signed-in demo session, and a small
mock backend; in production they run inside the app's real providers and data.

- **PlantSearch** — the "Choose Plants" step: a search box that looks crops up by
  common or botanical name and builds a removable wishlist of chips. Controlled —
  `wishlistIds` + `onAdd`/`onRemove`/`onClearAll` callbacks; optional `inspirationIds`
  + `onInspire`/`onUninspire` enable the bookmark action. In a design, typing a plant
  name returns results from a bundled seed list; **production wires the real
  `/api/crops` endpoint** (the host app supplies it). Use it in planning-bed and
  garden flows.
- **RecommendationDisplay** — the companion-search results: one card per garden bed
  listing its crops, the positive companion pairs (each with a confidence badge:
  anecdotal → traditional → observed → peer-reviewed), and pairs with no research
  data yet (an invitation to vote/fund research). Pass a `result` from the recommend
  engine (and optional `alternatives` to get the "Plan A / B" switcher); `overflow`
  and `conflicts` render as amber/destructive callouts. The save/accept actions show
  for a signed-in user.

## Composition notes

- Realistic domain content reads as projects, pledges/funding, backers, research logs,
  and seed/growing themes — keep example copy in that voice.
- Forms are `Label` + `Input` stacked in a `flex flex-col gap-2` column.
