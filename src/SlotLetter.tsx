/**
 * sloteffect — SlotLetter.
 *
 * Animates a single character as a slot reel rolling through its case's
 * alphabet (A–Z or a–z), wrapping around. Non-letter characters render static.
 */
import type { CSSProperties } from "react";
import { LOWER, type SlotDirection, UPPER } from "./reel";
import { Reel } from "./SlotReel";

export interface SlotLetterProps {
  /** The character to display. Only A–Z / a–z roll; others stay static. */
  char: string;
  /** Roll direction; defaults to `both` (random per transition). */
  direction?: SlotDirection;
  /** Optional class on the inline-flex container. */
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
  const charset =
    ch >= "A" && ch <= "Z" ? UPPER : ch >= "a" && ch <= "z" ? LOWER : null;

  return (
    <span
      role="img"
      aria-label={ch}
      className={className}
      style={{ display: "inline-flex", whiteSpace: "pre", ...style }}
    >
      {charset ? (
        <Reel charset={charset} glyph={ch} direction={direction} />
      ) : (
        <span
          aria-hidden="true"
          style={{ display: "block", height: "1em", lineHeight: "1em" }}
        >
          {ch}
        </span>
      )}
    </span>
  );
}
