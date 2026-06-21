/**
 * sloteffect — SlotNumber.
 *
 * Convenience wrapper that formats a number with `Intl.NumberFormat` (any
 * style: currency, percent, compact…) plus an optional suffix, then animates
 * the resulting string with `SlotText`. Digits roll; separators, symbols, and
 * the suffix stay static.
 *
 * Two opt-in flourishes use `Intl.NumberFormat.formatToParts` to locate each
 * digit's place value. `cents` renders the two fractional digits smaller and
 * baseline-aligned (price typography). `counter` rolls the digits like the
 * wheels of a gear-reduction odometer: each digit advances from the *previous*
 * value by however many of its own place-steps the value crossed, so the low
 * digits blur while the ten-thousands and up barely move.
 */
import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { odometerDigit, SLOT_EASING_SOFT, type SlotDirection } from "./reel";
import { SlotText } from "./SlotText";

export interface SlotNumberProps {
  /**
   * The value to display. Accepts any number (integers, decimals, negatives,
   * `NaN`/`Infinity`), a `bigint`, or an already-formatted string (passed
   * through verbatim — `cents`/`counter` are skipped for strings).
   */
  value: number | bigint | string;
  /** `Intl.NumberFormat` options (style, currency, fraction digits…). */
  format?: Intl.NumberFormatOptions;
  /** BCP 47 locale(s) for formatting. Defaults to `"en-US"`. */
  locales?: string | string[];
  /** Static text appended after the formatted number (e.g. `"/yr"`). */
  suffix?: string;
  /** Roll direction; defaults to `both` (random per digit). */
  direction?: SlotDirection;
  /** Randomize each digit's spin/settle per play; defaults to `false`. */
  randomSpin?: boolean;
  /**
   * Render the two fractional (cents) digits at 90% size, bottom-aligned with
   * the full-size integer part; the decimal point stays full size. Forces two
   * fraction digits. Defaults to `false`.
   */
  cents?: boolean;
  /**
   * Roll the digits like a gear-reduction odometer: each rolls from the
   * previous value, the low digits spinning many revolutions (a blur) while the
   * ten-thousands and up barely turn. Best for a value that changes
   * continuously (e.g. a slider). For a stable identity across re-renders, pass
   * a stable `format` reference. Defaults to `false`.
   */
  counter?: boolean;
  /** Optional class on the container. */
  className?: string;
  /** Optional inline style merged onto the container. */
  style?: CSSProperties;
}

export function SlotNumber({
  value,
  format,
  locales = "en-US",
  suffix = "",
  direction = "both",
  randomSpin = false,
  cents = false,
  counter = false,
  className,
  style,
}: SlotNumberProps) {
  // Track the previous value so counter mode can roll from it. Updated after
  // commit (not during render) so it's correct under StrictMode double-renders.
  const prevRef = useRef(typeof value === "number" ? value : 0);
  useEffect(() => {
    if (typeof value === "number") prevRef.current = value;
  });

  // Memoized so the formatted parts and odometer arrays keep a stable identity
  // across unrelated re-renders (only changing when an input does) — which keeps
  // an in-progress roll from being wiped and restarted.
  const plan = useMemo(() => {
    if (typeof value !== "number" && typeof value !== "bigint") return null;
    const opts: Intl.NumberFormatOptions = cents
      ? { ...format, minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : (format ?? {});
    const parts = new Intl.NumberFormat(locales, opts).formatToParts(value);

    // Split into the integer side (everything up to and including the decimal
    // point) and the fractional "cents" digits.
    let head = "";
    let frac = "";
    let intDigits = 0;
    for (const p of parts) {
      if (p.type === "fraction") frac += p.value;
      else head += p.value;
      if (p.type === "integer") intDigits += p.value.length;
    }
    const fracDigits = frac.length;

    // Per-digit odometer plan: the glyph each digit rolls from and how many
    // extra revolutions, mapped to the digit's power-of-ten place.
    const headFrom: string[] = [];
    const headCycles: number[] = [];
    const fracFrom: string[] = [];
    const fracCycles: number[] = [];
    let odometerDir: SlotDirection = direction;
    const odometer =
      counter && typeof value === "number" && Number.isFinite(value);
    if (odometer) {
      // Work in the smallest displayed unit so place 0 is the last fraction digit.
      const scale = 10 ** fracDigits;
      const cur = Math.round((value as number) * scale);
      const prev = Math.round(prevRef.current * scale);
      odometerDir = cur >= prev ? "up" : "down";
      let i = 0;
      for (const p of parts) {
        if (p.type === "integer") {
          for (const _ of p.value) {
            const d = odometerDigit(
              prev,
              cur,
              intDigits - 1 - i++ + fracDigits,
            );
            headFrom.push(d.from);
            headCycles.push(d.cycles);
          }
        } else if (p.type === "fraction") {
          for (let k = 0; k < p.value.length; k++) {
            const d = odometerDigit(prev, cur, fracDigits - 1 - k);
            fracFrom.push(d.from);
            fracCycles.push(d.cycles);
          }
        }
      }
    }
    return {
      head,
      frac,
      headFrom,
      headCycles,
      fracFrom,
      fracCycles,
      allFrom: [...headFrom, ...fracFrom],
      allCycles: [...headCycles, ...fracCycles],
      odometerDir,
      odometer,
    };
  }, [value, format, locales, cents, counter, direction]);

  // A preformatted string passes through verbatim — no part-aware features.
  if (plan === null) {
    return (
      <SlotText
        text={String(value) + suffix}
        direction={direction}
        randomSpin={randomSpin}
        className={className}
        style={style}
      />
    );
  }

  const { head, frac, odometer, odometerDir } = plan;
  // Counter mode spins low digits fast; its gentler settle reads better.
  const easing = counter ? SLOT_EASING_SOFT : undefined;

  // Without the cents treatment the whole number is a single reel.
  if (!cents || !frac) {
    return (
      <SlotText
        text={head + frac + suffix}
        direction={odometerDir}
        randomSpin={randomSpin}
        digitCycles={odometer ? plan.allCycles : undefined}
        digitFrom={odometer ? plan.allFrom : undefined}
        easing={easing}
        className={className}
        style={style}
      />
    );
  }

  // Cents: a smaller fractional reel sits baseline-aligned beside the integer
  // part; both are leaves of one labelled container so it reads as one number.
  return (
    <span
      role="img"
      aria-label={head + frac + suffix}
      className={className}
      style={{ display: "inline-block", ...style }}
    >
      <SlotText
        text={head}
        direction={odometerDir}
        randomSpin={randomSpin}
        digitCycles={odometer ? plan.headCycles : undefined}
        digitFrom={odometer ? plan.headFrom : undefined}
        easing={easing}
      />
      <SlotText
        text={frac}
        direction={odometerDir}
        randomSpin={randomSpin}
        digitCycles={odometer ? plan.fracCycles : undefined}
        digitFrom={odometer ? plan.fracFrom : undefined}
        easing={easing}
        style={{ fontSize: "0.9em" }}
      />
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}
