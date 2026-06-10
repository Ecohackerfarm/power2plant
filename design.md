# power2plant — Design Spec
**Modern · Friendly · Rooted in Nature**

---

## Concept

power2plant is a companion planting tool for curious, caring gardeners. The redesign moves away from a flat, utilitarian feel toward something that feels warm and alive — like advice from a knowledgeable friend who also happens to have great taste. The tone is approachable, the visuals are organic but never chaotic, and every interaction feels like it belongs in a garden.

---

## Color Palette

| Name | Hex | Role |
|---|---|---|
| Deep Moss | `#2D4A3E` | Primary text, headers, nav background |
| Sage | `#7BAE7F` | Accents, icons, interactive highlights |
| Warm Cream | `#F7F3E8` | Page background |
| Soil | `#C96A3A` | CTAs, warnings, emphasis |
| Sky Mist | `#D6EAF0` | Card backgrounds, hover states |
| Linen | `#EDE8DC` | Dividers, subtle borders |

**Palette logic:** Deep Moss grounds the design in nature without feeling generic. Soil adds warmth and draws the eye to action. Sky Mist keeps cards from looking sterile. The cream background feels handmade and inviting.

---

## Typography

### Display: *Fraunces* (Google Fonts)
- Used for hero titles, section headings, feature names
- Set with optical sizing — large and quirky, small and sharp
- Weights: 300 (light headlines), 700 (strong emphasis)

### Body: *DM Sans* (Google Fonts)
- All body text, labels, navigation, buttons
- Clean, open, and legible at small sizes
- Weights: 400 (body), 500 (UI labels), 600 (button text)

### Type Scale

```
Hero title:      Fraunces 56px / 700 / line-height 1.1
Section heading: Fraunces 32px / 300 / line-height 1.2
Card title:      DM Sans  18px / 600 / line-height 1.3
Body:            DM Sans  16px / 400 / line-height 1.6
Caption/label:   DM Sans  13px / 500 / letter-spacing 0.04em / uppercase
```

---

## Layout

### Grid
- Max content width: `1120px`
- Column grid: 12-col, 24px gutters
- Section vertical rhythm: `80px` padding top/bottom
- Mobile breakpoint: `768px` → single column

### Spacing Scale (rem-based)
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80 · 120`

### Border Radius
- Cards: `16px`
- Buttons: `100px` (pill)
- Tags/chips: `8px`
- Images: `12px`

---

## Navigation

```
┌──────────────────────────────────────────────────────┐
│  🌿 power2plant          Find · Plan · My Garden  [EN]│
└──────────────────────────────────────────────────────┘
```

- Background: Deep Moss `#2D4A3E`
- Logo: custom leaf mark (SVG) + wordmark in Fraunces 300
- Nav links: DM Sans 500, Warm Cream, spaced generously
- Language switcher: discreet, right-aligned, rounded pill
- Sticky on scroll with a soft drop shadow

---

## Hero Section

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   🌼  🌿  🍅  🌻  ← animated companion ring        │
│                                                     │
│   Grow better, together.                           │
│   Your companion planting guide for a              │
│   thriving, happy garden.                          │
│                                                     │
│   [ Find a companion plant ]  [ Plan my beds ]     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- Background: Warm Cream `#F7F3E8`
- **Signature element:** A slowly rotating SVG ring of illustrated plant icons — tomato, basil, marigold, carrot — with subtle "friendship" arcs connecting companions. Pauses on hover. This evokes the core concept without words.
- Headline: Fraunces 56px, Deep Moss, centered
- Subhead: DM Sans 18px, `#5A6E60`, max-width 480px
- Primary CTA: Soil `#C96A3A` pill button
- Secondary CTA: outlined in Deep Moss

---

## Feature Cards

Three cards in a horizontal row (stack on mobile):

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  🔍           │  │  🛏           │  │  🌱           │
│              │  │              │  │              │
│  Find a      │  │  Plan your   │  │  My Garden   │
│  companion   │  │  beds        │  │              │
│              │  │              │  │              │
│  Search any  │  │  Know what   │  │  See how     │
│  plant to    │  │  you want to │  │  your beds   │
│  find who    │  │  grow — find │  │  get along   │
│  it loves    │  │  what fits   │  │  together    │
│  (and who    │  │  together    │  │              │
│  it doesn't) │  │              │  │              │
│              │  │              │  │              │
│  [ Explore → ]│  │  [ Start →  ]│  │  [ Open →   ]│
└──────────────┘  └──────────────┘  └──────────────┘
```

- Card background: White with `1px` Linen border
- On hover: card lifts (`translateY -4px`), border turns Sage, icon animates a gentle 10° rotation
- Icon: large illustrated emoji or custom SVG, 48px, in a Sage tinted circle
- Card title: Fraunces 22px
- Body text: DM Sans 15px, `#5A6E60`
- Link: DM Sans 500, Sage color, with arrow

---

## Companion Relationship Display

Used on the `/relationships` page — the most-used feature.

```
┌─────────────────────────────────────────────────────┐
│  SEARCHING FOR                                      │
│  ┌──────────────────────────────────────────┐      │
│  │  🍅  Tomato                          ╳   │      │
│  └──────────────────────────────────────────┘      │
│                                                     │
│  💚 Good Friends (12)         💔 Best Avoided (4)   │
│  ──────────────────           ──────────────────    │
│  🌿 Basil         ★★★★★        🧅 Fennel    ✗       │
│  💐 Marigold      ★★★★☆        🥦 Kohlrabi  ✗       │
│  🥕 Carrot        ★★★☆☆        ...                  │
│  ...                                               │
└─────────────────────────────────────────────────────┘
```

- Search input: rounded, large (48px height), Warm Cream fill, Sage focus ring
- "Good Friends" section: green-tinted Sky Mist background
- "Best Avoided" section: light terracotta tint
- Star ratings for companion strength — friendly and scannable
- Each plant row is tappable → navigates to that plant's page

---

## Buttons

| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | Soil `#C96A3A` | White | — |
| Secondary | Transparent | Deep Moss | 2px Deep Moss |
| Tertiary | — | Sage | — (text link style) |
| Danger | `#D64A2A` | White | — |

- All buttons: DM Sans 600, 16px, pill shape (`border-radius: 100px`)
- Padding: `12px 24px`
- Hover: lighten 8% + subtle shadow
- Active: scale `0.97`
- Focus: 3px Sage outline, 2px offset

---

## Micro-interactions & Motion

- **Companion ring:** Slow auto-rotation (30s loop), pauses on hover. `prefers-reduced-motion` stops it entirely.
- **Card hover:** `translateY -4px` + border color shift, 200ms ease-out
- **Search input:** Sage underline slides in on focus, 150ms
- **Plant tags:** Gentle scale-up on hover (1.04×)
- **Page transitions:** 200ms fade — nothing dramatic

All transitions use `ease-out`. No bounces or springs — this is a garden, not a game.

---

## Iconography

Custom illustrated icons for each plant category (herbs, vegetables, flowers, fruits). Style: friendly linework with a single-color fill, 24px base size, scalable SVG. Use the Sage color family as primary fill.

System icons (search, close, arrows) from **Phosphor Icons** — Regular weight. Never mix icon styles.

---

## Empty States & Feedback

- **No results:** Illustrated wilted plant with upbeat message: *"Nothing found — try a different name or check the spelling."* Never just "No results."
- **Loading:** Three animated dots in Sage, no spinners
- **Success toast:** Sage background, white text, slides up from bottom, auto-dismisses after 3s
- **Error toast:** Soil background

---

## Accessibility

- All color combinations meet WCAG AA contrast (minimum 4.5:1 for body, 3:1 for large text)
- Focus indicators visible on all interactive elements
- All icons have `aria-label` or adjacent visible text
- Companion ring animation: `prefers-reduced-motion` respected — ring becomes static
- Language switcher announces current language to screen readers

---

## Responsive Behavior

| Breakpoint | Layout |
|---|---|
| `> 1024px` | Full desktop, 3-col cards, wide nav |
| `768–1024px` | Tablet, 2-col cards, compact nav |
| `< 768px` | Mobile, 1-col cards, hamburger menu |

Mobile-specific: hero text left-aligned (not centered), CTA buttons full-width, companion ring scales to 240px.

---

## Voice & Tone

- **Warm, not cutesy.** Say *"Your plants are ready."* Not *"Yay! 🎉 Your plants are ready!"*
- **Direct, not clinical.** Say *"Basil loves tomatoes."* Not *"Ocimum basilicum has a symbiotic relationship with Solanum lycopersicum."*
- **Encouraging, not preachy.** Guide, don't lecture.
- **Consistent.** Buttons always use the same verb as the confirmation: *"Plan beds"* → toast says *"Beds saved."*

---

## Design Principles Summary

1. **Alive, not static** — the design breathes through subtle motion and organic shapes
2. **Friendly authority** — warm tone backed by clear, reliable information
3. **One thing at a time** — each screen has a single clear job
4. **Nature-honest** — colors and textures reference real plants, not abstract "nature green"
5. **Work on any device** — built mobile-first, desktop-enhanced
