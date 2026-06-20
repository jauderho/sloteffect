/**
 * sloteffect — SlotLetter.
 *
 * Animates a single character as a slot reel. Latin letters roll through their
 * case's alphabet (A–Z / a–z) and digits through 0–9, both wrapping around; any
 * other glyph flips cleanly to its new value.
 */
import type { CSSProperties } from "react";
import type { SlotDirection } from "./reel";
import { SlotCell } from "./SlotCell";

export interface SlotLetterProps {
  /** The character to display. */
  char: string;
  /** Roll direction; defaults to `both` (random per transition). */
  direction?: SlotDirection;
  /** Optional class on the container. */
  className?: string;
  /** Optional inline style merged onto the container. */
  style?: CSSProperties;
}

export function SlotLetter({
  char,
  direction = "both",
  className,
  style,
}: SlotLetterProps) {
  const ch = Array.from(String(char))[0] ?? "";
  return (
    <span
      role="img"
      aria-label={ch}
      className={className}
      style={{ display: "inline-block", ...style }}
    >
      <SlotCell glyph={ch} direction={direction} />
    </span>
  );
}
