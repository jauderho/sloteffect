/**
 * sloteffect — SlotLetter.
 *
 * Animates a single character as a slot reel. Latin letters roll through their
 * case's alphabet (A–Z / a–z) and digits through 0–9, both wrapping; ideographs
 * spin through random characters; any other glyph flips to its new value.
 * A thin wrapper over {@link SlotText}.
 */
import type { CSSProperties } from "react";
import type { SlotDirection } from "./reel";
import { SlotText } from "./SlotText";

export interface SlotLetterProps {
  /** The character to display. */
  char: string;
  /** Roll direction; defaults to `both` (random per transition). */
  direction?: SlotDirection;
  /** Glyph pool ideographs spin through. Defaults to common Hanzi. */
  spinPool?: string;
  /** Randomize the spin/settle per play; defaults to `false`. */
  randomSpin?: boolean;
  /** Optional class on the container. */
  className?: string;
  /** Optional inline style merged onto the container. */
  style?: CSSProperties;
}

export function SlotLetter({
  char,
  direction = "both",
  spinPool,
  randomSpin = false,
  className,
  style,
}: SlotLetterProps) {
  const ch = Array.from(String(char))[0] ?? "";
  return (
    <SlotText
      text={ch}
      direction={direction}
      spinPool={spinPool}
      randomSpin={randomSpin}
      className={className}
      style={style}
    />
  );
}
