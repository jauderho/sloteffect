/**
 * sloteffect — shared reel primitives.
 *
 * A "reel" is a clipped 1em-tall strip holding three copies of a charset so it
 * can wrap in either direction. The visible glyph at charset index `i` is shown
 * by translating the strip to `-(L + i)em`, where `L` is the charset length and
 * the home (middle) copy starts at index `L`. This generalizes the per-digit
 * mechanism from SlotNumber.md from the fixed "0-9" charset to any charset.
 */

/** Rotational direction of a reel roll. `both` randomizes per reel. */
export type SlotDirection = "both" | "up" | "down";

/** Charsets the reels can roll through. */
export const DIGITS = "0123456789";
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const LOWER = "abcdefghijklmnopqrstuvwxyz";

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

/** Number of charset copies stacked in a reel strip (one above, home, one below). */
export const REEL_COPIES = 3;

/**
 * Resolve the strip index to animate *to* so the roll travels in `direction`,
 * borrowing a neighboring charset copy when it must wrap through the ends.
 *
 * Indices are expressed in the home (middle) copy: `fromIdx = L + from`,
 * `toIdx = L + to`, where `from`/`to` are charset indices and `L` the charset
 * length. The returned value may lie in the upper or lower copy; the caller
 * snaps back to the canonical `L + to` after the animation finishes.
 *
 * @param fromIdx  Current strip index (home copy), `L + from`.
 * @param toIdx    Target strip index (home copy), `L + to`.
 * @param length   Charset length `L`.
 * @param direction Roll direction.
 * @param coin     Random value in [0, 1) used only when `direction === "both"`.
 */
export function resolveTargetIndex(
  fromIdx: number,
  toIdx: number,
  length: number,
  direction: SlotDirection,
  coin: number,
): number {
  const rollUp = direction === "both" ? coin < 0.5 : direction === "up";
  let target = toIdx;
  if (rollUp && target <= fromIdx) target += length;
  if (!rollUp && target >= fromIdx) target -= length;
  return target;
}

/** Per-reel roll duration (ms) with jitter applied. */
export function rollDuration(coin: number = Math.random()): number {
  return BASE_DURATION + coin * DURATION_JITTER;
}
