# AESTHETIC_CONTRACT.md

> **Purpose.** This is a binding design contract for every app in this repo. You (the implementing model — Claude, Codex, or otherwise) did not author the visual direction — it is fixed here and already shipped across all six apps. Your job is to produce UI that looks as if it came from a single, opinionated senior designer. Do not improvise the aesthetic. Do not "improve" the palette. Follow the rules; deviate only where this document explicitly grants latitude.
>
> **How to use.** Read the entire file before writing any UI code. Treat the token block in §3 as the single source of truth for color, type, and surface values. Reference tokens by name — never invent a new color. When in doubt, choose the more restrained option. End every UI task by running the **Compliance Checklist** at the bottom against your own output.
>
> **Provenance.** This language originated in `estate-planner-simulator` and was deliberately propagated to all apps (commits `0f645de`…`1048124`), then extended with the data-visualization conventions in §8 (commits `11fdcf4`…`097ae35`). The shipped apps are the reference implementation — when this document and the code disagree, flag it; don't silently pick one.

---

## 0. Design philosophy (the "why," in five lines)

1. **Restraint is the aesthetic.** Calm, confident, quiet — an heirloom-ledger feel, not a fintech dashboard. One gold accent, used sparingly, earns its weight.
2. **Tufte governs the data; Apple HCI governs the chrome.** Maximize data-ink, label the data directly, keep grids quiet. Generous touch targets, content-first hierarchy, deference to the user's numbers.
3. **Dark-first.** The default theme is dark. Light is a first-class equal, never an afterthought. A toggle is mandatory.
4. **Typography does the work.** Newsreader serif gives the headlines and hero numbers their voice; Hanken Grotesk carries the UI. Hierarchy comes from size, weight, and whitespace — not boxes and borders.
5. **Lead with the answer.** Every app opens its results with one dominant number that answers the user's core question (§7). Detail tables and charts support it; they never substitute for it.

---

## 1. Non-negotiables (violating any of these is a failed task)

- **Default to dark mode** with a working light/dark toggle. (In claude.ai artifact builds, persist via in-memory state — never `localStorage` there; the standalone bundled apps may use `localStorage` where they already do.)
- **Tokens only.** All colors come from §3. No new hex values, no second accent hue, no gradients except the sanctioned area-fill top-fades already in the code.
- **One accent: gold.** `#d4b87a` (dark) / `#9a7b2e` (light). Semantic green/red/amber are separate and used only for meaning (gain/loss/warning) — never decoration.
- **Fonts are fixed:** Newsreader (serif) + Hanken Grotesk (sans). **No monospace anywhere** — numbers use `font-variant-numeric: tabular-nums` on the sans face. Forbidden as primary faces: Inter, Roboto, Arial, SF Pro, Geist, Cormorant Garamond (was once referenced unloaded — do not reintroduce).
- **Numerals are tabular.** Any aligned numbers (tables, stat cards, chart axes, tooltips) use `tabular-nums`. Currency/percent columns right-aligned.
- **i18n is mandatory.** Every user-facing string goes into the app's EN + ZH dictionaries (each app has its own `STRINGS`/`T`/`TRANSLATIONS` object — match its pattern). Write zh natively, not translated-sounding; Taiwan-facing copy treats zh as the primary audience.
- **Accessibility floor:** WCAG AA contrast, visible `:focus-visible` ring (gold) on every interactive element, ≥44×44px hit targets, full keyboard operability, `prefers-reduced-motion` honored.
- **Apps stay self-contained.** Tokens are duplicated per app by convention (§11) — no shared CSS package. A token change means editing every app's block identically.

---

## 2. Typography

```
Headings / wordmarks / hero numbers:  'Newsreader', 'Noto Serif TC', serif      (weights 400, 500; italic 400)
UI / body / labels / numbers:         'Hanken Grotesk', 'Noto Sans TC', ui-sans-serif, system-ui, sans-serif   (400/500/600/700)
```

Loaded via Google Fonts `@import` inside each app's injected CSS block.

| Role | Face | Size | Weight | Notes |
|---|---|---|---|---|
| App title (h1) | Newsreader | clamp(26px, 4vw, 40px) | 500 | letter-spacing −0.01em |
| **Hero answer-number** | Newsreader | clamp(30px, 4vw, 40px) | 500 | `tabular-nums`, line-height ~1.1 (§7) |
| Section / panel title | Newsreader | 18–20px | 500 | |
| Eyebrow / kicker | Hanken | 11px | 700 | uppercase, letter-spacing 0.12–0.14em, gold |
| Body | Hanken | 13–15px | 400–500 | |
| Field labels | Hanken | 10–12px | 600–700 | uppercase, tracking 0.06–0.12em, muted |
| Stat-card value | Hanken | 19–23px | 700 | `tabular-nums` |
| Chart tick labels | Hanken | **11px** | 400 | `tick` token color (§3) — never below 11px, never the old 9px |
| Chart endpoint/value labels | Hanken | 10–11px | 600 | series hue + surface halo (§8) |

Serif is reserved for *voice* (titles, hero numbers, donut centers); everything operational is sans. Don't set body text in Newsreader.

---

## 3. Design tokens — single source of truth

Names vary per app (`--ac`, `c.gold`, `--accent`, `--acc` all mean the gold accent); **values do not**. Dark first, light second.

```
/* Backgrounds */
bg        #0a0b0d   /  #f7f4ee      page base (warm near-black / warm paper)
surface   #15181d   /  #ffffff      cards
surface2  #1b1f26   /  #f3efe6      raised: inputs, hover, segmented controls
border    #262b34   /  #e2dccf
border2   #333a45   /  #d4ccbb      emphasized borders, hover

/* Text */
text      #f4f3f0   /  #1a1814      never pure #fff / #000
text2     #b9bcc4   /  #4b4742      secondary
text3     #7e8390   /  #857f74      muted labels
tick      #a8aeb8   /  #6b6560      chart axis ticks ONLY (higher contrast than text3)

/* Accent */
gold      #d4b87a   /  #9a7b2e      the ONE accent; focus rings, eyebrows, active states
gold-bg   rgba(212,184,122,.09–.12) / rgba(154,123,46,.07–.10)
on-gold   #1a1408   /  #ffffff      text on gold fills (dark theme uses near-black)

/* Semantic — meaning only */
good      #5ed6a4   /  #1f8a5b
danger    #ff6b6b   /  #c0392b
warn      #f0b955   /  #b07d12

/* Chart categorical (warm; max ~5 visible series) */
gold      #d4b87a   /  #9a7b2e
sage      #5ed6a4   /  #1f8a5b
amber     #f0b955   /  #b07d12
clay      #c98a6b   /  #a05a38      (roth-optimizer's "blue" slot holds clay — keep it)
plum      #b08bc9   /  #7a5a96
orange    #e08f4f   /  #b5642a
taupe     #a89a7e   (both themes)
teal      #5bc8d6   /  #1f7a8a      secondary-person series (e.g. spouse) — never a tint of green

/* Chart chrome */
grid      rgba(212,184,122,.10) dark  /  rgba(130,108,56,.12) light   (quiet, dashed "3 3"/"3 4")
```

Surfaces: cards are `surface` with 1px `border`, radius 14–16px; accent cards add a 3px gold left border. Shadows are rare and soft; dark mode prefers surface contrast over shadow.

> **Recharts caveat:** SVG `fill`/`stroke` don't reliably inherit CSS variables in every app's setup. Apps that hit this use fixed hex constants for chart colors (e.g. financial-scenarios' `CC` object) — keep those hex values in sync with this table rather than "fixing" them to vars.

---

## 4. Spacing & layout

- 4px grid; lean on 8/12/16/20/24 rhythm. Card padding 16–24px.
- **Control-height parity — adjacent controls render at identical heights.** Every input, select, segmented control, and button is `min-height: 44px` with `box-sizing: border-box`; controls sharing a row also share vertical padding and font-size so they measure equal via bounding rects (±0px), not "close". Selects get `appearance: none` plus a token-colored SVG chevron (never the UA widget — it desyncs heights across platforms); beware `background:` shorthand later in the cascade silently resetting `background-repeat/size` on that chevron — use `background-color`. Field rows bottom-anchor their controls (flex column + `margin-top:auto` on the control — see estate-planner's `.numfield`) so a label wrapping to two lines never knocks its control out of line with siblings. Toggle switches may keep a small visual pill, but the interactive element still reserves ≥44px hit height.
- **Equal-height adjacent cells.** Cards/stat cells in a grid row stretch to the row height (grid default — don't opt out). For divider-style metric grids (1px gaps over a contrasting background), an incomplete final row must not expose the gap color as a slab — give cells their own 1px `box-shadow` dividers over a `surface` background (estate-planner `.metrics` is the reference).
- **No overlapping or crowded elements — clearance is computed, not eyeballed.** Absolutely-positioned annotations (gauge markers, marker letters, chart endpoint labels, floating badges) must reserve layout headroom derived from their full extent: overhang + label height + stagger levels + breathing room. Nothing may overlap, or sit closer than 8px to, unrelated text or controls. Stagger colliding labels (the taiwan-estate-tax bracket-gauge letters are the reference); verify clearance in the DOM (compare bounding rects), not by squinting at a screenshot.
- Max content width ~820–1280px per app (each app has an established container — match it).
- **Inputs → results flow:** inputs left/top, insights right/bottom; the hero insight (§7) sits at the top of results, above gauges/charts/tables.
- Mobile-first; major reflow breakpoints already in code (~520 / 760–920px). Verify 390 / 768 / 1280px.
- Touch targets ≥44px (inputs, buttons, sliders, selects already enforce `min-height: 44px` — keep it).

---

## 5. Components (match in-repo precedents — don't invent parallel ones)

- **Card** — `surface`, 1px `border`, radius 14–16px; optional 3px gold left border for emphasis.
- **Inputs** — `surface2` fill, 1px border, radius 7–12px; focus = gold border + `0 0 0 3px gold-bg` ring; `tabular-nums`; ≥16px font on iOS-facing inputs (prevents zoom); `min-height: 44px` + `box-sizing: border-box` always (§4 control-height parity).
- **Label hints** — inline gold/muted hints appended to a field label (`· GRAT hurdle` style) get explicit spacing from the label (≥4px `margin-left`); never rely on a bare text space against a letter-spaced uppercase label.
- **Segmented control** — pill group on `surface2`; active segment filled gold with `on-gold` text.
- **Stat card / Metric** — uppercase 10–11px muted label over a 19–23px 700 `tabular-nums` value; color on the value only when it carries meaning (good/danger).
- **Badges/chips** — `radius-full` or small radius, 11px, `surface2` neutral; semantic colors only for true status.
- **Tables** — header 9.5–10px uppercase muted with tracking; cells 11–12.5px; numbers right-aligned tabular; row borders `border` at low alpha; highlight rows with `gold-bg`, not new hues. Multi-column comparison tables use `table-layout: fixed` so the compared columns are **equal width** — never let content-driven auto layout produce ragged columns; if best/worst cells are highlighted, apply the treatment consistently to every row where direction has meaning.
- **Icons** — `lucide-react`, 1.5–2px stroke, one family per app. Emoji appear only as decorative section glyphs where an app already uses them (taiwan-estate-tax section titles, magi insights) — never as interactive icons; don't add new ones.
- Empty states: one line of muted text + one clear action. Never a blank pane.

---

## 6. Motion

- Charts: `isAnimationActive={false}` by default (heavy recomputes — Monte Carlo, state switching). Opt-in only where an app exposes an `animate` prop.
- Chrome transitions: 0.15–0.3s ease on color/background/border; a subtle fade-up (~0.28s, 8px) for tab content is the only sanctioned entrance.
- **Hero numbers animate with the slot-machine digit roll — and nothing else does.** Every app carries a local `SlotNumber`/`SlotText` component (duplicated per app like tokens; magi-irmaa-aca is the reference): each digit is its own reel that rolls up *or* down at random per transition, wrapping through 0–9, with the shared precomputed spring `linear()` easing (ζ≈0.68, ~5% overshoot, 750–1050ms jittered per digit) — the slot-machine-style effect. Non-digit characters (`$`, `,`, `%`, `/yr`, `NT$`) stay static; the formatted string is the `aria-label`; `prefers-reduced-motion` snaps instantly. Apply it to hero/key answer-numbers only. Small chips/deltas beside a hero may instead use `@number-flow/react` (`continuous` plugin + the same spring `spinTiming`); tables, axes, and tooltips never animate.
- `prefers-reduced-motion: reduce` → near-zero durations (magi-irmaa-aca has the reference rule).
- No bounce, no parallax, no decorative animation.

---

## 7. The HeroInsight pattern (mandatory for results)

Every app leads its results with **one dominant answer-number** — the thing the user came to learn ("Lifetime tax savings $184,000", "Estate tax: NT$12.4M", "ACA subsidy lost: $9,800/yr").

Anatomy (duplicated per app — `HeroInsight` in roth-optimizer, `HeroBanner` in magi-irmaa-aca, `.hero-line` in estate-planner are the references):

```
┌─ card: surface, 1px border, 3px gold LEFT border, radius 14, padding 16×20 ─┐
│ EYEBROW           11px / 700 / uppercase / 0.14em tracking / gold           │
│ $184,000          Newsreader 500, clamp(30px,4vw,40px), tabular-nums        │
│ context line      13px Hanken, text2                                        │
│ chip · chip       10.5px uppercase muted key + 13px/700 colored value       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Color discipline:** the big number stays neutral (`text`) unless its *sign* is the meaning (a loss/surcharge may be `danger`, a credit `good`). Color belongs to the delta chips. Never gold-color the number itself — gold is the eyebrow.

**Breathing room:** hero numbers use `line-height ≥ 1.15` (never 1.0–1.1 — Newsreader descenders clip), keep ≥6px clearance below the number block, and the card holds ≥16px vertical padding. The number must never touch or clip a card edge; verify with bounding rects, not by eye. Hero numbers animate via the slot-machine roll (§6).

---

## 8. Charts & data viz (Recharts; Tufte rules — the heart of this contract)

1. **Quiet grids, readable labels.** Gridlines stay at the §3 `grid` alphas, dashed, horizontal-only where sensible. Tick labels are 11px in the `tick` token — raise label contrast, never grid loudness. Add `.recharts-cartesian-axis-tick text { font-variant-numeric: tabular-nums; }`.
2. **Direct labeling over legends.** Label line series at their final point: 11px / 600 in the series hue, with a **3.5px surface-colored `paint-order: stroke` halo** (`stroke={surface} strokeWidth={3.5} paintOrder="stroke" strokeLinejoin="round"`). Each app has a local `endLabel(lastIndex, text, color, halo, dy)` helper — reuse it; stagger `dy` (−7 / +16) when series converge. Keep a compact legend as mobile/colorblind redundancy where it already exists.
3. **Reference lines are named on the chart.** Thresholds (IRMAA tiers, exemptions, SS tiers, cliffs, depletion year) are 1.75–2px dashed `"4 3"` with an inline `label` carrying name **and** value ("Tier 1 · $212k"), 10px / 600+ in the line's hue. Never legend-only, never 1px.
4. **Series hierarchy.** Primary series 2.5–2.75px solid; context series 1.5px dashed and/or ~55–70% opacity. The eye must find the answer-line first.
5. **Bars carry their values.** Tornado bars get lo/hi values at both ends; waterfall/rate bars get per-segment values — via `<LabelList>` (10–10.5px / 600, tabular, surface halo). **Recharts pitfall: a `<Label>` child inside `<Bar>` renders nothing — always `LabelList`.** Widen the chart's right margin (~50–60px) to fit end labels.
6. **Confidence bands are range areas.** `dataKey={d => [d.p10, d.p90]}`, fill = primary hue at ~0.13 opacity, no stroke. **Never** the p90-fill + surface-colored-mask trick — it occludes gridlines and couples to the background. Tooltips then read p10/p90 off `payload[0].payload`, not named entries.
7. **Distinct hues, not tints.** Two series must never be tints of one hue (the spouse-ACA green→teal fix is the precedent). Redundant encoding (hue + dash) for adjacent series.
8. **Tooltips** match `surface` + 1px `border`, radius 8, 11px, tabular numerals, formatted currency.
9. **No chartjunk:** no 3D, no bar shadows, no rainbow palettes; gradient fills only as the existing top-fade on area charts (0.32 → 0.02 opacity).
10. **Gauges/infographics** (ACA/IRMAA tracks, TW bracket gauge, composition bars) are plain div/SVG segments: active segment full-opacity gold with `on-gold` text, inactive ~0.16–0.4; marker is a 2px `text`-colored rule; always annotate position in words ("NT$X of headroom before the 15% bracket").

---

## 9. Anti-patterns — DO NOT

- ❌ Introduce a new hue, a blue accent, or a gradient hero. The accent is gold. Full stop.
- ❌ Use monospace fonts, Inter/Roboto/SF/Geist, or weight 800+ anywhere.
- ❌ Pure `#000`/`#fff` text or backgrounds — use the §3 off-tones.
- ❌ 9px tick labels, legend-only threshold lines, unlabeled tornado/waterfall bars.
- ❌ Text below 10px anywhere (the old 8–9px micro-labels are purged); table headers bottom out at 9.5px.
- ❌ Controls below 44px height, a select rendering a different height than its row siblings, or a native UA select chevron.
- ❌ Hero numbers at `line-height: 1.0–1.1`, or a number that touches/clips its card edge.
- ❌ Animating numbers outside hero/key values, or any number animation that ignores `prefers-reduced-motion`.
- ❌ `<Label>` inside `<Bar>` (silently renders nothing) — use `<LabelList>`.
- ❌ Surface-colored mask areas to fake a band — use range areas.
- ❌ Hardcode user-facing English without adding the EN+ZH dictionary keys.
- ❌ Extract a shared CSS/token package "to DRY it up" — self-contained apps are a deliberate constraint.
- ❌ Color a hero number gold, or color values that carry no meaning.
- ❌ Animate charts by default, or add decorative motion.
- ❌ Add libraries the task didn't need. Recharts + lucide-react is the entire viz/icon stack.

---

## 10. Compliance checklist (run before declaring done)

- [ ] Dark is default; light/dark toggle works; both themes checked deliberately (contrast, halo colors, thin dashed lines).
- [ ] Zero new hex values — everything maps to §3 (or an app's existing aliases of it).
- [ ] Gold is the only accent; green/red/amber appear only with meaning.
- [ ] Newsreader for titles/hero numbers; Hanken for everything else; `tabular-nums` on all aligned figures.
- [ ] Results lead with a HeroInsight answer-number per §7.
- [ ] Charts: 11px `tick`-colored labels; primary series ≥2.5px; thresholds ≥1.75px dashed with inline name+value labels; line endpoints directly labeled with halo; bars value-labeled via `LabelList`; bands are range areas.
- [ ] New strings exist in both EN and ZH dictionaries; ZH reads natively.
- [ ] 390 / 768 / 1280px verified; endpoint labels don't collide on mobile; ≥44px hit targets.
- [ ] Zero overlapping or crowded elements: absolute-positioned annotations have computed headroom with ≥8px clearance from neighboring text/controls (verified via bounding rects); comparison-table columns are equal width.
- [ ] Control-height parity verified via bounding rects: every input/select/segmented/button ≥44px, and controls sharing a row measure identical heights with aligned tops/bottoms (including rows where a label wraps to two lines).
- [ ] Hero numbers: `line-height ≥1.15`, descender clearance from the card edge, slot-machine roll fires on value change and snaps under `prefers-reduced-motion`.
- [ ] Adjacent cards/stat cells in each grid row are equal height; divider-grid final rows expose no background slab.
- [ ] Focus rings, hover, disabled, empty states present; `prefers-reduced-motion` honored.
- [ ] Per app: `bun run build` produces `index.html`; TS apps pass `bunx tsc --noEmit`; engine untouched unless the task demanded it.

---

## 11. Where the tokens live (per app — edit all of them for any token change)

| App | Token home |
|---|---|
| estate-planner-simulator | `CSS` string (~line 1810+) + chart `C` ternary (~line 542) — the reference implementation |
| roth-optimizer | `D` object, § L (~line 609); `blue` slot intentionally holds clay |
| state-tax-compare | `.dk` / `.lt` CSS-var blocks (~line 328) + `chartTheme()` (~line 398) |
| magi-irmaa-aca | `.dk` / `.lt` CSS-var blocks (~line 41) |
| financial-scenarios | `THEME_CSS` blocks + fixed-hex `CC` chart object (~line 819 — keep hex, see §3 caveat) |
| taiwan-estate-tax | `CSS_VARS` `[data-theme=…]` blocks |

Preview servers for visual checks: `.claude/launch.json` (ports 4173–4177, serve each app's built `index.html`).
