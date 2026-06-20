# sloteffect

> Stock-Events-style **slot-machine rolls** for numbers, letters, and text in
> React. Each digit or character is its own reel that rolls **up or down** to its
> new value, wrapping through the charset, with a springy settle.

- **Dependency-free** — React is the only peer dependency (Web Animations API + a
  precomputed CSS `linear()` spring; no animation library, no JS spring loop).
- **Three components** — [`SlotNumber`](#slotnumber), [`SlotLetter`](#slotletter),
  [`SlotText`](#slottext).
- **Directional** — `direction="both"` (random per reel, default), `"up"`, or `"down"`.
- **Accessible** — the formatted value is the `aria-label`; reels are
  presentational; `prefers-reduced-motion` snaps instantly.
- **Tiny** — ~5 KB ESM, tree-shakeable, ships ESM + CJS + types.

**[▶ Live demo](https://jauderho.github.io/sloteffect/)**

---

## Install

```sh
bun add sloteffect       # or: npm i sloteffect / pnpm add sloteffect / yarn add sloteffect
```

React 18 or 19 is a peer dependency.

## Quick start

```tsx
import { SlotNumber, SlotLetter, SlotText } from "sloteffect";

// Currency / percent / compact — anything Intl.NumberFormat can format
<SlotNumber value={total} format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />

// A single rolling character
<SlotLetter char={grade} />

// An arbitrary string: letters and digits roll, the rest stays put
<SlotText text="JACKPOT 7" />
```

Place a component inside a styled element — it inherits `font-family`,
`font-size`, and `color` from the parent.

---

## Components

### `SlotNumber`

Formats a number with `Intl.NumberFormat` (plus an optional suffix) and rolls the
digits. Separators, currency symbols, and the suffix stay static.

```tsx
<SlotNumber value={0.813} format={{ style: "percent", minimumFractionDigits: 1 }} />   // 81.3%
<SlotNumber value={surcharge} format={{ style: "currency", currency: "USD" }} suffix="/yr" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `number` | — | The numeric value. |
| `format` | `Intl.NumberFormatOptions` | — | Style, currency, fraction digits, etc. |
| `locales` | `string \| string[]` | `"en-US"` | BCP 47 locale(s). |
| `suffix` | `string` | `""` | Static text appended after the number (e.g. `"/yr"`). |
| `direction` | `"both" \| "up" \| "down"` | `"both"` | Roll direction. |
| `className` / `style` | — | — | Passed to the container. |

### `SlotLetter`

A single character rolling through its case's alphabet (`A–Z` or `a–z`), wrapping
around. Non-letters render static.

```tsx
<SlotLetter char="Q" direction="up" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `char` | `string` | — | The character to display. |
| `direction` | `"both" \| "up" \| "down"` | `"both"` | Roll direction. |
| `className` / `style` | — | — | Passed to the container. |

### `SlotText`

Animates any string. Each letter rolls through its case's alphabet, each digit
rolls through `0–9`, and every other character (spaces, punctuation, symbols)
stays static. Reels are right-anchored so trailing positions keep rolling as the
string grows or shrinks.

```tsx
<SlotText text="Level 12" direction="down" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `text` | `string \| number` | — | The string to display. |
| `direction` | `"both" \| "up" \| "down"` | `"both"` | Roll direction. |
| `className` / `style` | — | — | Passed to the container. |

---

## Direction

Every component accepts `direction`:

| Value | Behavior |
|---|---|
| `"both"` *(default)* | Each reel flips a coin — up or down — independently. |
| `"up"` | All reels roll upward (charset index increases), wrapping. |
| `"down"` | All reels roll downward, wrapping. |

---

## Integration notes

- **Use `tabular-nums`.** Set `font-variant-numeric: tabular-nums` on the parent
  so digits keep an identical width and the layout doesn't shiver.
- **Line-height lives outside.** Reel cells are exactly `1em` tall; give the
  parent `line-height ≥ 1.15` (serif faces especially) so nothing clips.
- **Reserve it for hero numbers.** Animate key stats and answer-numbers — not
  tables, axis ticks, or tooltips that re-render wholesale.
- **Reduced motion.** Under `prefers-reduced-motion: reduce` the reels snap to the
  final value with no animation. (Headless/preview browsers often report reduced
  motion — stub `matchMedia` to observe the roll in tests.)
- **Latin digits.** The reels roll through Latin `0–9` / `A–Z` / `a–z`. For other
  numeral systems, format with the `nu-latn` numbering system.

---

## Publishing (maintainers)

Releases publish to npm via **OIDC Trusted Publishing** with provenance — no npm
token is stored in the repo. One-time setup on npmjs.com:

1. Publish `0.1.0` once manually (`npm publish --access public`) so the package
   exists, **or** configure a pending trusted publisher before the first release.
2. On the package page → **Settings → Publishing access → Trusted publisher**,
   add a **GitHub Actions** publisher: this repository + workflow file
   `publish.yml`.
3. Thereafter, publishing a **GitHub Release** runs
   [`.github/workflows/publish.yml`](.github/workflows/publish.yml), which builds
   and runs `npm publish --provenance` using a short-lived OIDC credential.

## Development

```sh
bun install
bun run typecheck   # tsc --noEmit (strict)
bun run lint        # biome check
bun run test        # vitest (direction/wraparound logic)
bun run build       # tsup → dist/ (ESM + CJS + .d.ts)
```

The showcase ([`index.html`](index.html)) is a single, build-free file deployed to
GitHub Pages by [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

## License

[MIT](LICENSE) © Jauder Ho
