/**
 * sloteffect — SlotText.
 *
 * Animates any string: each letter rolls through its case's alphabet, each
 * digit rolls through 0–9, and every other character (spaces, punctuation,
 * symbols) stays static. Reels are right-anchored by key so trailing positions
 * keep their instances — and thus animate — as the string grows or shrinks.
 */
import type { CSSProperties } from "react";
import { DIGITS, LOWER, type SlotDirection, UPPER } from "./reel";
import { Reel } from "./SlotReel";

const CELL: CSSProperties = {
  display: "block",
  height: "1em",
  lineHeight: "1em",
};

export interface SlotTextProps {
  /** The string (or number) to display. */
  text: string | number;
  /** Roll direction; defaults to `both` (random per reel). */
  direction?: SlotDirection;
  /** Optional class on the inline-flex container. */
  className?: string;
  /** Optional inline style merged onto the container. */
  style?: CSSProperties;
}

/** The charset a character belongs to, or `null` if it should stay static. */
function charsetFor(ch: string): string | null {
  if (ch >= "0" && ch <= "9") return DIGITS;
  if (ch >= "A" && ch <= "Z") return UPPER;
  if (ch >= "a" && ch <= "z") return LOWER;
  return null;
}

export function SlotText({
  text,
  direction = "both",
  className,
  style,
}: SlotTextProps) {
  const label = String(text);
  const chars = Array.from(label);
  const n = chars.length;

  return (
    <span
      role="img"
      aria-label={label}
      className={className}
      style={{ display: "inline-flex", whiteSpace: "pre", ...style }}
    >
      {chars.map((ch, i) => {
        const k = n - i; // right-anchored keys: trailing reels persist
        const charset = charsetFor(ch);
        return charset ? (
          <Reel
            key={`r${k}`}
            charset={charset}
            glyph={ch}
            direction={direction}
          />
        ) : (
          <span aria-hidden="true" key={`s${k}${ch}`} style={CELL}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}
