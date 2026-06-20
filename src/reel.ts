/**
 * sloteffect — shared reel primitives.
 *
 * The slot roll is built lazily: at rest a character is a single glyph, and the
 * rolling strip (the sequence of glyphs travelled through) is computed only for
 * the duration of a transition. `buildRoll` returns that minimal sequence plus
 * the start/end row to show, so the component never renders a full charset.
 *
 * For ordered charsets (digits, same-case Latin letters) the roll travels the
 * charset in order, wrapping around — the authentic reel. For any other glyph
 * pair (other scripts, emoji, punctuation, cross-charset) it is a clean two-row
 * flip, so SlotText works for arbitrary text in any writing direction.
 */

/** Rotational direction of a reel roll. `both` randomizes per reel. */
export type SlotDirection = "both" | "up" | "down";

/** Ordered charsets the reels roll through in sequence. */
export const DIGITS = "0123456789";
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const LOWER = "abcdefghijklmnopqrstuvwxyz";

/**
 * Row height in `em`. Slightly taller than 1em so ascenders, descenders, CJK,
 * and emoji are not clipped by the reel's `overflow: hidden` window.
 */
export const ROW_H = 1.3;

/**
 * Underdamped spring (ζ≈0.68): ~5% overshoot, settles within the duration.
 * Precomputed `linear()` easing string — see SlotNumber.md for the generator.
 */
export const SLOT_EASING =
  "linear(0, 0.0548, 0.1842, 0.3463, 0.5118, 0.6628, 0.7895, 0.8885, 0.9605, " +
  "1.0086, 1.0372, 1.051, 1.0542, 1.0508, 1.0435, 1.0346, 1.0256, 1.0176, " +
  "1.0108, 1.0056, 1.0018, 0.9993, 0.9979, 0.9972, 0.9971, 1)";

/** Base roll duration (ms) before per-reel jitter. */
export const BASE_DURATION = 750;
/** Maximum extra duration (ms) added per reel so columns settle asynchronously. */
export const DURATION_JITTER = 300;

/** The ordered charset a character belongs to, or `null` if it has none. */
export function charsetOf(ch: string): string | null {
  if (ch >= "0" && ch <= "9") return DIGITS;
  if (ch >= "A" && ch <= "Z") return UPPER;
  if (ch >= "a" && ch <= "z") return LOWER;
  return null;
}

/** The shared ordered charset of `from` and `to`, or `null` if they differ. */
function sharedCharset(from: string, to: string): string | null {
  const cs = charsetOf(from);
  return cs && cs === charsetOf(to) ? cs : null;
}

/** Inclusive path through `charset` from `from` to `to` stepping forward (+1, wrapping). */
function forwardPath(charset: string, from: string, to: string): string[] {
  const len = charset.length;
  const fi = charset.indexOf(from);
  const ti = charset.indexOf(to);
  const steps = (ti - fi + len) % len || len;
  const rows: string[] = [];
  for (let k = 0; k <= steps; k++) rows.push(charset[(fi + k) % len] as string);
  return rows;
}

/** Inclusive path through `charset` from `from` to `to` stepping backward (-1, wrapping). */
function backwardPath(charset: string, from: string, to: string): string[] {
  const len = charset.length;
  const fi = charset.indexOf(from);
  const ti = charset.indexOf(to);
  const steps = (fi - ti + len) % len || len;
  const rows: string[] = [];
  for (let k = 0; k <= steps; k++)
    rows.push(charset[(fi - k + len) % len] as string);
  return rows;
}

/** A computed roll: the rows to render and which row to show at start/end. */
export interface Roll {
  /** Glyphs stacked top-to-bottom in the rolling strip. */
  rows: string[];
  /** Row index visible at the start of the animation (shows `from`). */
  startRow: number;
  /** Row index visible at the end of the animation (shows `to`). */
  endRow: number;
}

/**
 * Build the minimal rolling strip for a `from → to` transition.
 *
 * @param coin Random value in [0, 1) used only when `direction === "both"`.
 */
export function buildRoll(
  from: string,
  to: string,
  direction: SlotDirection,
  coin: number,
): Roll {
  const rollUp = direction === "both" ? coin < 0.5 : direction === "up";
  const cs = sharedCharset(from, to);
  if (rollUp) {
    const rows = cs ? forwardPath(cs, from, to) : [from, to];
    return { rows, startRow: 0, endRow: rows.length - 1 };
  }
  const rows = (cs ? backwardPath(cs, from, to) : [from, to]).reverse();
  return { rows, startRow: rows.length - 1, endRow: 0 };
}

/** Per-reel roll duration (ms) with jitter applied. */
export function rollDuration(coin: number = Math.random()): number {
  return BASE_DURATION + coin * DURATION_JITTER;
}

/** True when the user has requested reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
