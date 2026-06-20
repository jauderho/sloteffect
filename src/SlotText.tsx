/**
 * sloteffect — SlotText.
 *
 * Animates any string in any script. The text is split into grapheme clusters
 * (so emoji, combining marks, and surrogate pairs stay intact), and each cluster
 * is a slot cell: digits and same-case Latin letters roll through their charset,
 * everything else flips cleanly to its new glyph. Resting cells use normal text
 * layout, so spacing, kerning, and bidirectional (LTR/RTL) ordering are correct.
 */
import type { CSSProperties } from "react";
import type { SlotDirection } from "./reel";
import { SlotCell } from "./SlotCell";

/** Split a string into grapheme clusters (falls back to code points). */
function segment(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

export interface SlotTextProps {
  /** The string (or number) to display. */
  text: string | number | bigint;
  /** Roll direction; defaults to `both` (random per cell). */
  direction?: SlotDirection;
  /**
   * Text direction. `auto` (default) infers LTR/RTL from the content; pass
   * `ltr`/`rtl` to force it.
   */
  dir?: "auto" | "ltr" | "rtl";
  /** Optional class on the container. */
  className?: string;
  /** Optional inline style merged onto the container. */
  style?: CSSProperties;
}

export function SlotText({
  text,
  direction = "both",
  dir = "auto",
  className,
  style,
}: SlotTextProps) {
  const label = String(text);
  const cells = segment(label);
  const n = cells.length;

  return (
    <span
      role="img"
      aria-label={label}
      dir={dir}
      className={className}
      style={{ display: "inline-block", whiteSpace: "pre", ...style }}
    >
      {cells.map((g, i) => (
        // Right-anchored keys: trailing cells keep their identity (and roll)
        // as the string grows or shrinks.
        // biome-ignore lint/suspicious/noArrayIndexKey: right-anchored key is deliberate
        <SlotCell key={`c${n - i}`} glyph={g} direction={direction} />
      ))}
    </span>
  );
}
