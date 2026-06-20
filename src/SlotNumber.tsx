/**
 * sloteffect — SlotNumber.
 *
 * Convenience wrapper that formats a number with `Intl.NumberFormat` (any
 * style: currency, percent, compact…) plus an optional suffix, then animates
 * the resulting string with `SlotText`. Digits roll; separators, symbols, and
 * the suffix stay static.
 */
import type { CSSProperties } from "react";
import type { SlotDirection } from "./reel";
import { SlotText } from "./SlotText";

export interface SlotNumberProps {
  /**
   * The value to display. Accepts any number (integers, decimals, negatives,
   * `NaN`/`Infinity`), a `bigint`, or an already-formatted string (passed
   * through verbatim).
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
  /** Optional class on the inline-flex container. */
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
  className,
  style,
}: SlotNumberProps) {
  const formatted =
    typeof value === "string"
      ? value
      : new Intl.NumberFormat(locales, format).format(value);
  const text = formatted + suffix;
  return (
    <SlotText
      text={text}
      direction={direction}
      className={className}
      style={style}
    />
  );
}
