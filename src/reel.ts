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
 * Underdamped spring (ζ≈0.68): ~5% overshoot, then a smooth settle. Sampled at
 * 60 steps with a frequency (ω_d≈3π) high enough that the oscillation fully
 * decays *within* the duration — so the curve lands on 1 cleanly instead of
 * snapping the last few pixels into place. See SlotNumber.md for the generator.
 */
export const SLOT_EASING =
  "linear(0, 0.0208, 0.0752, 0.1525, 0.2439, 0.3422, 0.4417, 0.5382, 0.6286, " +
  "0.711, 0.7839, 0.847, 0.9002, 0.944, 0.9789, 1.0058, 1.0257, 1.0395, " +
  "1.0483, 1.0529, 1.0543, 1.0532, 1.0502, 1.046, 1.041, 1.0357, 1.0303, " +
  "1.0251, 1.0202, 1.0157, 1.0117, 1.0083, 1.0054, 1.003, 1.0011, 0.9997, " +
  "0.9986, 0.9979, 0.9974, 0.9971, 0.9971, 0.9971, 0.9973, 0.9975, 0.9978, " +
  "0.9981, 0.9984, 0.9986, 0.9989, 0.9991, 0.9994, 0.9995, 0.9997, 0.9998, " +
  "0.9999, 1, 1.0001, 1.0001, 1.0001, 1.0002, 1)";

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
 * Ordered charsets travel their charset in order (wrapping). Any other pair is
 * a flip from `from` to `to`, optionally spun through `fill` glyphs in between
 * (used for ideographs — see {@link sampleSpin}).
 *
 * @param coin Random value in [0, 1) used only when `direction === "both"`.
 * @param fill Intermediate glyphs inserted between `from` and `to` for
 *   non-ordered pairs (ignored for ordered charsets).
 */
export function buildRoll(
  from: string,
  to: string,
  direction: SlotDirection,
  coin: number,
  fill: string[] = [],
): Roll {
  const rollUp = direction === "both" ? coin < 0.5 : direction === "up";
  const cs = sharedCharset(from, to);
  const path = cs
    ? rollUp
      ? forwardPath(cs, from, to)
      : backwardPath(cs, from, to)
    : [from, ...fill, to];
  if (rollUp) return { rows: path, startRow: 0, endRow: path.length - 1 };
  const rows = path.slice().reverse();
  return { rows, startRow: rows.length - 1, endRow: 0 };
}

/** Number of random glyphs an ideograph spins through before settling. */
export const SPIN_LENGTH = 6;

/**
 * Common Traditional Chinese characters used as the default spinner pool for
 * ideographs — random members are rolled through to simulate a reel.
 */
export const DEFAULT_SPIN_POOL =
  "的一是不了人我在有他這為之大來以個中上們到說國和地也子時道出而要於就下得可你年生自會那後能對著事其裡所去行過家十用發天如然作方成者多日都三小軍二無同麼經法當起與好看學進種將還分此心前面又定見只主沒公從金東風花雨山水火土木月日星雲海";

/** True when `ch`'s first code point is a CJK ideograph. */
export function isIdeograph(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x3400 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x2fa1f)
  );
}

/** True when `ch` is an emoji / pictographic glyph (which never rolls). */
export function isEmoji(ch: string): boolean {
  return /\p{Extended_Pictographic}/u.test(ch);
}

/**
 * Coarse class of a grapheme. Digits and same-case Latin letters roll their
 * charset; ideographs and other-script letters spin/flip; `symbol` (currency,
 * separators, spaces, punctuation) and `emoji` never animate.
 */
export function glyphKind(ch: string): string {
  if (isEmoji(ch)) return "emoji";
  const cs = charsetOf(ch);
  if (cs) return cs;
  if (isIdeograph(ch)) return "ideograph";
  return /\p{Letter}/u.test(ch) ? "letter" : "symbol";
}

/** Kinds whose graphemes never animate (they swap in place). */
export const STATIC_KINDS = new Set(["emoji", "symbol"]);

/** Pick `n` random glyphs from `pool` (for the ideograph spinner). */
export function sampleSpin(
  pool: string,
  n: number,
  rand: () => number = Math.random,
): string[] {
  const out: string[] = [];
  const chars = Array.from(pool);
  for (let i = 0; i < n; i++)
    out.push(chars[Math.floor(rand() * chars.length)] as string);
  return out;
}

/** Pick a random glyph from `pool`, avoiding `exclude` when possible. */
export function randomGlyph(
  pool: string[],
  exclude = "",
  rand: () => number = Math.random,
): string {
  const choices = pool.filter((g) => g !== exclude);
  const from = choices.length ? choices : pool;
  return from[Math.floor(rand() * from.length)] ?? "";
}

/** A reel's starting glyph and the glyphs it spins through before landing. */
export interface ReelStart {
  /** Glyph shown at the start of the roll. */
  from: string;
  /** Intermediate spin glyphs (empty for ordered charsets — they roll in order). */
  fill: string[];
}

/**
 * Decide how `target` should animate given the previous grapheme aligned to its
 * position (`source`, or `null` when none lines up).
 *
 * - Emoji and symbols never animate → returns `null`.
 * - A same-kind, unchanged source → `null` (the real text already shows it).
 * - A same-kind, changed source → rolls from that real value.
 * - Otherwise a same-kind start glyph is synthesized (digits/letters from their
 *   charset, ideographs from `spinPool`, other scripts from `letterPool`) so the
 *   grapheme still spins regardless of how the two strings line up.
 *
 * @param letterPool Same-kind glyphs (other scripts) drawn from the live text.
 */
export function chooseReel(
  target: string,
  source: string | null,
  letterPool: string[],
  spinPool: string,
  rand: () => number = Math.random,
): ReelStart | null {
  const kind = glyphKind(target);
  if (STATIC_KINDS.has(kind)) return null;

  const cs = charsetOf(target);
  const usable = source && !isEmoji(source) && glyphKind(source) === kind;
  const from = usable
    ? (source as string)
    : randomGlyph(
        cs
          ? Array.from(cs)
          : isIdeograph(target)
            ? Array.from(spinPool)
            : letterPool,
        target,
        rand,
      );
  if (!from || from === target) return null;

  const fill = cs
    ? []
    : isIdeograph(target)
      ? sampleSpin(spinPool, SPIN_LENGTH, rand)
      : sampleSpin(letterPool.join(""), SPIN_LENGTH, rand);
  return { from, fill };
}

/** Per-reel roll duration (ms) with jitter applied. */
export function rollDuration(coin: number = Math.random()): number {
  return BASE_DURATION + coin * DURATION_JITTER;
}

/** FNV-1a hash of a string → 32-bit seed (for deterministic spins). */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Seeded PRNG (mulberry32) returning values in [0, 1). The same seed yields the
 * same sequence, so a value can be made to spin identically every time.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when the user has requested reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
