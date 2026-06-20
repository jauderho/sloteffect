# SlotEffect — slot-machine digit rolls for hero numbers

A small, dependency-free React effect that animates numeric values the way the
iOS *Stock Events* app does: when a value changes, **each digit is its own
slot-machine reel** that rolls to the new digit **up or down at random**,
wrapping through 0–9, with a springy settle. Non-digit characters (`$`, `,`,
`.`, `%`, `NT$`, `/yr`, unit suffixes…) stay put.

It works for **any numeric string** — currency, percentages, compact notation
(`$5.97M`), durations, counts — because the reels are driven by the *formatted
text*, not by a number type.

- ~90 lines, no dependencies (React + Web Animations API).
- Per-digit random direction with wraparound (3-copy reel strip).
- Spring easing via a precomputed CSS `linear()` curve (no JS spring loop).
- Per-digit duration jitter so reels settle asynchronously (the "slot" feel).
- `prefers-reduced-motion` snaps instantly.
- Accessible: the formatted string is the `aria-label`; reels are presentational.

---

## How it works

1. **Format first, animate second.** The value is formatted to a string
   (`Intl.NumberFormat` or any formatter you already have). The string is split
   into characters; digits become `<SlotDigit>` reels, everything else renders
   as static cells.

2. **A reel is a clipped vertical strip.** Each digit cell is a `1em`-tall,
   `overflow: hidden` box containing a strip of **three copies of 0–9**
   (30 rows, each `1em` tall). The visible digit is selected purely with
   `transform: translateY(-(10 + digit) × 1em)` — index 10–19 is the "home"
   middle copy. Because rows are `1em`, all math works in `em` units and never
   needs `getBoundingClientRect`.

3. **Random direction with wraparound.** On a digit change `from → to`, flip a
   coin for the visual direction. Rolling *up* means the strip translates
   further up (index increases); rolling *down* means it decreases. If the
   target index in the middle copy lies the "wrong way", shift it ±10 into the
   neighboring copy — that's the wraparound (3 → 1 rolling up passes through
   4…9, 0, 1). After the animation finishes, snap (no animation) back to the
   equivalent middle-copy index so reels never drift off the strip.

4. **Spring without a spring library.** The easing is a CSS
   `linear(…)` approximation of an underdamped spring (ζ ≈ 0.68, ω₀ = 9),
   sampled at 26 points — about 5% overshoot, settles clean. The Web Animations
   API accepts it as a plain `easing` string. Duration is jittered per digit
   (`750 + random() × 300` ms) so columns stop at slightly different times.

5. **Stable reels via right-anchored keys.** Cells are keyed by their distance
   from the *right* end of the string (`key = length − index`). When
   `$9,800 → $13,190` grows a character, the trailing digits keep their reel
   instances (and thus animate), while genuinely new positions mount at their
   final value without a spurious roll. A digit position that becomes a comma
   (or vice versa) changes key and remounts — which is the correct visual.

6. **Reduced motion & a11y.** If `prefers-reduced-motion: reduce`, the strip
   transform is set directly — instant snap. The container carries
   `role="img"` + `aria-label={text}` so screen readers announce the value,
   not "0 1 2 3 4 5 6 7 8 9".

### Generating the spring curve

The `linear()` string below was precomputed with this closed-form underdamped
spring (regenerate to taste — stiffer, bouncier, longer):

```python
import math
zeta, w0, N = 0.68, 9.0, 25          # damping ratio, natural freq, samples
wd = w0 * math.sqrt(1 - zeta**2)
x = lambda t: 1 - math.exp(-zeta*w0*t) * (math.cos(wd*t) + (zeta*w0/wd)*math.sin(wd*t))
print("linear(" + ", ".join(f"{x(i/N):.4f}" for i in range(N+1)) + ")")
```

---

## Reference implementation (React 18+, JS or TS)

```jsx
import { useLayoutEffect, useRef } from "react";

// Underdamped spring (ζ≈0.68): ~5% overshoot, settles within the duration.
const SLOT_EASING =
  "linear(0, 0.0548, 0.1842, 0.3463, 0.5118, 0.6628, 0.7895, 0.8885, 0.9605, " +
  "1.0086, 1.0372, 1.051, 1.0542, 1.0508, 1.0435, 1.0346, 1.0256, 1.0176, " +
  "1.0108, 1.0056, 1.0018, 0.9993, 0.9979, 0.9972, 0.9971, 1)";

// Three copies of 0-9 so a reel can wrap in either direction.
const SLOT_REEL = "012345678901234567890123456789";

const CELL = { display: "block", height: "1em", lineHeight: "1em" };

function SlotDigit({ digit }) {
  const stripRef = useRef(null);
  const prevRef = useRef(digit);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const from = prevRef.current, to = digit;
    prevRef.current = digit;
    if (!strip) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (from === to || reduce) {
      strip.style.transform = `translateY(${-(10 + to)}em)`;
      return;
    }

    // Coin-flip the visual direction, then force the target index that way,
    // borrowing the neighboring reel copy when it has to wrap through 0/9.
    const rollUp = Math.random() < 0.5;
    const fromIdx = 10 + from;
    let toIdx = 10 + to;
    if (rollUp && toIdx <= fromIdx) toIdx += 10;
    if (!rollUp && toIdx >= fromIdx) toIdx -= 10;

    strip.getAnimations().forEach((a) => a.cancel());
    strip.style.transform = `translateY(${-toIdx}em)`; // final (pre-snap) state
    const anim = strip.animate(
      [
        { transform: `translateY(${-fromIdx}em)` },
        { transform: `translateY(${-toIdx}em)` },
      ],
      { duration: 750 + Math.random() * 300, easing: SLOT_EASING },
    );
    // Snap back to the canonical middle-copy index (same glyph, no visual jump).
    anim.onfinish = () => { strip.style.transform = `translateY(${-(10 + to)}em)`; };
  }, [digit]);

  return (
    <span style={{ display: "block", overflow: "hidden", height: "1em" }}>
      <span ref={stripRef} style={{ display: "block", transform: `translateY(${-(10 + digit)}em)` }}>
        {Array.from(SLOT_REEL).map((d, i) => (
          <span key={i} style={CELL}>{d}</span>
        ))}
      </span>
    </span>
  );
}

/** Animate any preformatted numeric string: "$1,234", "81.3%", "NT$9,983,000", "$5.97M"… */
export function SlotText({ text }) {
  const chars = Array.from(String(text));
  const n = chars.length;
  return (
    <span role="img" aria-label={String(text)} style={{ display: "inline-flex", whiteSpace: "pre" }}>
      {chars.map((ch, i) => {
        const k = n - i; // right-anchored keys: trailing digits keep their reels
        return /\d/.test(ch)
          ? <SlotDigit key={`d${k}`} digit={Number(ch)} />
          : <span aria-hidden="true" key={`s${k}${ch}`} style={CELL}>{ch}</span>;
      })}
    </span>
  );
}

/** Convenience wrapper: number in, Intl.NumberFormat options for any style. */
export function SlotNumber({ value, format, locales = "en-US", suffix = "" }) {
  const text = new Intl.NumberFormat(locales, format).format(value) + suffix;
  return <SlotText text={text} />;
}
```

### Usage

```jsx
// Currency
<SlotNumber value={taxDue} format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />

// Percent (0.083 → "8.3%")
<SlotNumber value={rate} format={{ style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }} />

// Compact ("$5.97M") — or any house formatter you already have
<SlotText text={fmtCurrency(median)} />

// Unit suffix
<SlotNumber value={surcharge} format={USD0} suffix="/yr" />
```

Place it inside the styled element; it inherits `font-family`, `font-size`,
`color`, and `font-variant-numeric` from the parent:

```jsx
<div className="hero-big">
  <SlotNumber value={total} format={USD0} />
</div>
```

---

## Integration notes & pitfalls

- **Use `tabular-nums`.** Set `font-variant-numeric: tabular-nums` on the
  parent so every digit (and reel row) has identical width — otherwise the
  layout shivers as digits change.
- **Line-height lives outside.** Cells are exactly `1em`/`line-height: 1em`,
  so the visible glyph box is uniform across static and rolling cells (this is
  what keeps `$`, digits, and suffixes on one optical baseline). The *parent*
  controls overall line height; give hero numbers `line-height ≥ 1.15` so
  nothing clips.
- **Don't animate the world.** Reserve it for hero/answer numbers and key
  stats. Tables, axis ticks, and tooltips that re-render wholesale become
  noise.
- **TypeScript:** type `SlotDigit`'s ref as `useRef<HTMLSpanElement>(null)` and
  `format` as `Intl.NumberFormatOptions`.
- **Debounced sources:** if the value is debounced upstream, the roll fires
  when the debounce settles — expected, but remember it when testing.
- **Testing under emulated browsers:** headless/preview browsers often report
  `prefers-reduced-motion: reduce`, which makes the component (correctly) snap
  instead of roll. Stub `matchMedia` in the test page to observe the animation.
- **Locale digits:** the reel strip is Latin `0-9`. For locales with non-Latin
  numerals, either format with `nu-latn` or extend `SLOT_REEL` + the `/\d/`
  test to the target digit set.
- **Mid-flight retargets** are handled by cancelling running animations and
  rolling from the last *logical* digit; rapid-fire updates stay coherent.

## Behavior summary

| Transition | Result |
|---|---|
| `$12,000,000 → $19,200,000` | Only the two changed digits roll (random directions); the rest hold still |
| `$9,800 → $13,190` | Trailing digits keep reels and roll; the new leading character pops in at its final value |
| `81.3% → 79.6%` | Three reels roll; `.` and `%` never move |
| Same value re-render | Nothing animates |
| `prefers-reduced-motion` | Instant snap, no motion |
