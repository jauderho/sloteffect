import { describe, expect, it } from "vitest";
import {
  buildRoll,
  COUNTER_CYCLE_CAP,
  charsetOf,
  chooseReel,
  DEFAULT_SPIN_POOL,
  DIGITS,
  FALLBACK_EASING,
  glyphKind,
  hashSeed,
  isEmoji,
  isIdeograph,
  LOWER,
  makeRng,
  OVERSHOOT_HEADROOM,
  odometerDigit,
  padOvershoot,
  randomGlyph,
  rollDuration,
  SLOT_EASING,
  SLOT_EASING_SOFT,
  SPIN_LENGTH,
  STATIC_KINDS,
  safeEasing,
  sampleSpin,
  segmentWithOffsets,
  supportsLinearEasing,
  UPPER,
} from "./reel";

/** Max value in a CSS `linear(...)` easing — its peak overshoot is this − 1. */
function linearPeak(easing: string): number {
  return Math.max(
    ...easing
      .slice("linear(".length, -1)
      .split(",")
      .map((n) => Number.parseFloat(n)),
  );
}

describe("charsetOf", () => {
  it("classifies digits, upper, lower, and other", () => {
    expect(charsetOf("4")).toBe(DIGITS);
    expect(charsetOf("Q")).toBe(UPPER);
    expect(charsetOf("q")).toBe(LOWER);
    expect(charsetOf("$")).toBeNull();
    expect(charsetOf("中")).toBeNull();
  });
});

describe("buildRoll — ordered digit charset", () => {
  it("rolls up through the charset, showing from→to", () => {
    const r = buildRoll("3", "7", "up", 0);
    expect(r.rows).toEqual(["3", "4", "5", "6", "7"]);
    expect(r.rows[r.startRow]).toBe("3");
    expect(r.rows[r.endRow]).toBe("7");
    expect(r.startRow).toBe(0);
  });

  it("wraps up through 9→0", () => {
    const r = buildRoll("7", "3", "up", 0);
    expect(r.rows).toEqual(["7", "8", "9", "0", "1", "2", "3"]);
    expect(r.rows[r.endRow]).toBe("3");
  });

  it("rolls down, showing from→to in reverse travel", () => {
    const r = buildRoll("7", "3", "down", 0);
    expect(r.rows[r.startRow]).toBe("7");
    expect(r.rows[r.endRow]).toBe("3");
    // Visible sequence as the strip moves: 7,6,5,4,3
    const seen = [];
    for (let i = r.startRow; i >= r.endRow; i--) seen.push(r.rows[i]);
    expect(seen).toEqual(["7", "6", "5", "4", "3"]);
  });
});

describe("buildRoll — letter charset wraps the alphabet", () => {
  it("Z rolls up to A", () => {
    const r = buildRoll("Z", "A", "up", 0);
    expect(r.rows).toEqual(["Z", "A"]);
    expect(r.rows[r.endRow]).toBe("A");
  });

  it("A rolls down to Z", () => {
    const r = buildRoll("A", "Z", "down", 0);
    expect(r.rows[r.startRow]).toBe("A");
    expect(r.rows[r.endRow]).toBe("Z");
  });
});

describe("buildRoll — non-ordered glyphs flip cleanly", () => {
  it("cross-charset is a two-row flip", () => {
    const up = buildRoll("A", "5", "up", 0);
    expect(up.rows).toEqual(["A", "5"]);
    expect(up.rows[up.startRow]).toBe("A");
    expect(up.rows[up.endRow]).toBe("5");
  });

  it("arbitrary scripts/emoji flip", () => {
    const r = buildRoll("中", "文", "up", 0);
    expect(r.rows).toEqual(["中", "文"]);
    const e = buildRoll("🍒", "🔔", "down", 0);
    expect(e.rows[e.startRow]).toBe("🍒");
    expect(e.rows[e.endRow]).toBe("🔔");
  });
});

describe("buildRoll — fill spins non-ordered pairs through extra glyphs", () => {
  it("inserts fill between from and to when rolling up", () => {
    const r = buildRoll("中", "文", "up", 0, ["天", "地"]);
    expect(r.rows).toEqual(["中", "天", "地", "文"]);
    expect(r.rows[r.startRow]).toBe("中");
    expect(r.rows[r.endRow]).toBe("文");
  });

  it("still shows from→to with fill when rolling down", () => {
    const r = buildRoll("中", "文", "down", 0, ["天", "地"]);
    expect(r.rows[r.startRow]).toBe("中");
    expect(r.rows[r.endRow]).toBe("文");
  });

  it("ignores fill for ordered charsets", () => {
    const r = buildRoll("3", "5", "up", 0, ["9", "9"]);
    expect(r.rows).toEqual(["3", "4", "5"]);
  });
});

describe("buildRoll — cycles add full revolutions to ordered charsets", () => {
  it("prepends one extra revolution rolling up, still landing on `to`", () => {
    const base = buildRoll("3", "7", "up", 0);
    const r = buildRoll("3", "7", "up", 0, [], 1);
    expect(r.rows).toHaveLength(base.rows.length + DIGITS.length);
    expect(r.rows[r.startRow]).toBe("3");
    expect(r.rows[r.endRow]).toBe("7");
  });

  it("adds revolutions rolling down without breaking the wrap", () => {
    const r = buildRoll("7", "3", "down", 0, [], 2);
    expect(r.rows).toHaveLength(
      buildRoll("7", "3", "down", 0).rows.length + 20,
    );
    expect(r.rows[r.startRow]).toBe("7");
    expect(r.rows[r.endRow]).toBe("3");
    expect(r.rows.every((g) => DIGITS.includes(g))).toBe(true);
  });

  it("ignores cycles for non-ordered (flip) pairs", () => {
    const r = buildRoll("中", "文", "up", 0, ["天"], 3);
    expect(r.rows).toEqual(["中", "天", "文"]);
  });
});

describe("odometerDigit", () => {
  it("holds an unchanged digit still and reports its previous glyph", () => {
    const d = odometerDigit(300000000, 300000000, 4);
    expect(d.cycles).toBe(0);
    expect(d.from).toBe("0");
  });

  it("spins low places fast and high places slowly (gear reduction)", () => {
    const prev = 300000000;
    const cur = 300123456; // +$1,234.56 in cents
    expect(odometerDigit(prev, cur, 0).cycles).toBe(COUNTER_CYCLE_CAP); // units
    expect(odometerDigit(prev, cur, 6).cycles).toBe(0); // unchanged high place
    expect(odometerDigit(prev, cur, 2).cycles).toBeGreaterThan(
      odometerDigit(prev, cur, 4).cycles,
    );
  });

  it("rolls from the previous digit at that place", () => {
    // $2,718,281.82 → place 2 (whole dollars) previous digit is 1.
    expect(odometerDigit(271828182, 271900000, 2).from).toBe("1");
  });

  it("caps revolutions and handles down moves", () => {
    const big = odometerDigit(0, 999999999, 0);
    expect(big.cycles).toBe(COUNTER_CYCLE_CAP);
    expect(odometerDigit(500, 300, 0).cycles).toBe(
      odometerDigit(300, 500, 0).cycles,
    );
  });
});

describe("isIdeograph", () => {
  it("detects CJK ideographs only", () => {
    expect(isIdeograph("中")).toBe(true);
    expect(isIdeograph("獎")).toBe(true);
    expect(isIdeograph("A")).toBe(false);
    expect(isIdeograph("7")).toBe(false);
    expect(isIdeograph("🍒")).toBe(false);
  });
});

describe("isEmoji", () => {
  it("detects pictographic glyphs only", () => {
    expect(isEmoji("🍒")).toBe(true);
    expect(isEmoji("🔔")).toBe(true);
    expect(isEmoji("A")).toBe(false);
    expect(isEmoji("7")).toBe(false);
    expect(isEmoji("中")).toBe(false);
  });
});

describe("glyphKind", () => {
  it("groups digits, same-case letters, and ideographs for rolling", () => {
    expect(glyphKind("7")).toBe(glyphKind("3"));
    expect(glyphKind("A")).toBe(glyphKind("Z"));
    expect(glyphKind("a")).not.toBe(glyphKind("A"));
    expect(glyphKind("中")).toBe(glyphKind("文"));
    // Letters of any script flip among themselves.
    expect(glyphKind("ש")).toBe(glyphKind("ל"));
    expect(glyphKind("ש")).toBe("letter");
  });

  it("marks emoji and symbols/separators as non-rolling kinds", () => {
    expect(glyphKind("🍒")).toBe("emoji");
    // Currency, separators, and spaces share the non-rolling "symbol" kind, so
    // none ever rolls into a digit — the denomination stays stationary.
    expect(glyphKind("$")).toBe("symbol");
    expect(glyphKind(",")).toBe("symbol");
    expect(STATIC_KINDS.has(glyphKind("$"))).toBe(true);
    expect(STATIC_KINDS.has(glyphKind(","))).toBe(true);
    expect(glyphKind("4")).not.toBe(glyphKind("$"));
  });
});

describe("sampleSpin", () => {
  it("returns n glyphs, all drawn from the pool", () => {
    const out = sampleSpin(DEFAULT_SPIN_POOL, 6, () => 0.5);
    expect(out).toHaveLength(6);
    const pool = Array.from(DEFAULT_SPIN_POOL);
    for (const ch of out) expect(pool).toContain(ch);
  });
});

describe("randomGlyph", () => {
  it("avoids the excluded glyph when alternatives exist", () => {
    expect(randomGlyph(["a", "b"], "a", () => 0)).toBe("b");
    expect(randomGlyph(["a", "b"], "a", () => 0.99)).toBe("b");
    // Falls back to the pool when everything is excluded.
    expect(randomGlyph(["a"], "a", () => 0)).toBe("a");
  });
});

describe("chooseReel", () => {
  it("does not animate emoji, symbols, or unchanged graphemes", () => {
    expect(chooseReel("🍒", "🔔", [], DEFAULT_SPIN_POOL)).toBeNull();
    expect(chooseReel("$", "5", [], DEFAULT_SPIN_POOL)).toBeNull();
    expect(chooseReel(",", "1", [], DEFAULT_SPIN_POOL)).toBeNull();
    expect(chooseReel("A", "A", [], DEFAULT_SPIN_POOL)).toBeNull();
  });

  it("rolls from a same-kind source through its charset", () => {
    const r = chooseReel("7", "3", [], DEFAULT_SPIN_POOL);
    expect(r).toEqual({ from: "3", fill: [] });
  });

  it("synthesizes a same-kind start when no usable source lines up", () => {
    // No source: a digit still rolls in from another digit.
    const digit = chooseReel("5", null, [], DEFAULT_SPIN_POOL, () => 0);
    expect(digit?.from).toBe("0");
    expect(digit?.fill).toEqual([]);
    // Cross-kind source (Hebrew → uppercase): rolls in from the alphabet.
    const upper = chooseReel("J", "ש", [], DEFAULT_SPIN_POOL, () => 0);
    expect(upper?.from).toBe("A");
  });

  it("spins ideographs through the spin pool", () => {
    const r = chooseReel("文", "東", [], DEFAULT_SPIN_POOL);
    expect(r?.fill).toHaveLength(SPIN_LENGTH);
  });

  it("spins other-script letters through the in-script pool", () => {
    // Hebrew target with no usable source spins through Hebrew letters.
    const pool = ["ש", "ל", "ו", "ם", "ע"];
    const r = chooseReel("ם", null, pool, DEFAULT_SPIN_POOL, () => 0);
    expect(r).not.toBeNull();
    expect(pool).toContain(r?.from);
    expect(r?.fill).toHaveLength(SPIN_LENGTH);
    for (const g of r?.fill ?? []) expect(pool).toContain(g);
  });
});

describe("buildRoll — both picks a side from the coin", () => {
  it("coin < 0.5 matches up, coin >= 0.5 matches down", () => {
    expect(buildRoll("3", "7", "both", 0.1)).toEqual(
      buildRoll("3", "7", "up", 0),
    );
    expect(buildRoll("3", "7", "both", 0.9)).toEqual(
      buildRoll("3", "7", "down", 0),
    );
  });
});

describe("makeRng / hashSeed", () => {
  it("is deterministic for a given seed and varies across seeds", () => {
    const seq = (seed: number) =>
      Array.from({ length: 4 }, makeRng(seed)) as number[];
    expect(seq(123)).toEqual(seq(123)); // reproducible
    expect(seq(123)).not.toEqual(seq(124)); // seed-sensitive
    for (const v of seq(123)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("hashSeed maps equal strings to equal seeds, different strings apart", () => {
    expect(hashSeed("GARDEN")).toBe(hashSeed("GARDEN"));
    expect(hashSeed("GARDEN")).not.toBe(hashSeed("VOYAGE"));
  });

  it("a seeded chooseReel reproduces the same start glyph", () => {
    const a = chooseReel(
      "5",
      null,
      [],
      DEFAULT_SPIN_POOL,
      makeRng(hashSeed("x")),
    );
    const b = chooseReel(
      "5",
      null,
      [],
      DEFAULT_SPIN_POOL,
      makeRng(hashSeed("x")),
    );
    expect(a).toEqual(b);
  });
});

describe("rollDuration", () => {
  it("is BASE at coin 0 and BASE+JITTER at coin 1", () => {
    expect(rollDuration(0)).toBe(750);
    expect(rollDuration(1)).toBe(1050);
  });
});

describe("padOvershoot — guard rows so the spring bounce never reveals blank", () => {
  it("appends the landing glyph for an up-roll, leaving the rest position", () => {
    // "3"→"7" up: rows 3,4,5,6,7 (start 0, land 4), travel 4 → 1 guard row.
    const { rows, startRow, endRow } = buildRoll("3", "7", "up", 0);
    const padded = padOvershoot([...rows], startRow, endRow);
    expect(padded.firstRow).toBe(0);
    expect(padded.landRow).toBe(4);
    expect(padded.rows[padded.landRow]).toBe("7");
    // Guard rows sit *past* the landing glyph and repeat it (seamless bounce).
    expect(padded.rows.slice(5)).toEqual(["7"]);
    expect(padded.rows[padded.firstRow]).toBe("3");
  });

  it("prepends guard rows for a down-roll and shifts both indices", () => {
    // "7"→"3" down: rows 3,4,5,6,7 (start 4, land 0), travel 4 → 1 guard row.
    const { rows, startRow, endRow } = buildRoll("7", "3", "down", 0);
    const padded = padOvershoot([...rows], startRow, endRow);
    expect(padded.landRow).toBe(1); // shifted by the 1 prepended guard
    expect(padded.firstRow).toBe(5);
    expect(padded.rows[padded.landRow]).toBe("3"); // still lands on "3"
    expect(padded.rows[padded.firstRow]).toBe("7"); // still starts on "7"
    expect(padded.rows[0]).toBe("3"); // guard above the landing row is "3"
  });

  it("scales the guard count with the roll's travel", () => {
    const long = buildRoll("0", "9", "up", 0, [], COUNTER_CYCLE_CAP); // ~69 rows
    const travel = long.endRow - long.startRow;
    const padded = padOvershoot([...long.rows], long.startRow, long.endRow);
    expect(padded.rows.length - long.rows.length).toBe(
      Math.ceil(travel * OVERSHOOT_HEADROOM),
    );
    expect(padded.rows.length - long.rows.length).toBeGreaterThan(1);
    // Every padded-on row repeats the landing glyph.
    for (const g of padded.rows.slice(long.rows.length)) expect(g).toBe("9");
  });

  it("guard count always covers the spring easings' real overshoot", () => {
    // If an easing is ever retuned to overshoot more than OVERSHOOT_HEADROOM,
    // the guard rows would be too few and the bounce would reveal blank space.
    for (const travel of [4, 9, 20, 69]) {
      const overshootRows = travel * (linearPeak(SLOT_EASING) - 1);
      const guard = Math.ceil(travel * OVERSHOOT_HEADROOM);
      expect(guard).toBeGreaterThanOrEqual(overshootRows);
    }
  });
});

describe("OVERSHOOT_HEADROOM vs the spring easings", () => {
  it("headroom is at least the peak overshoot of both easings", () => {
    expect(linearPeak(SLOT_EASING) - 1).toBeLessThanOrEqual(OVERSHOOT_HEADROOM);
    expect(linearPeak(SLOT_EASING_SOFT) - 1).toBeLessThanOrEqual(
      OVERSHOOT_HEADROOM,
    );
  });

  it("both easings start at 0 and settle at 1", () => {
    for (const e of [SLOT_EASING, SLOT_EASING_SOFT]) {
      const pts = e
        .slice("linear(".length, -1)
        .split(",")
        .map((n) => Number.parseFloat(n));
      expect(pts[0]).toBe(0);
      expect(pts[pts.length - 1]).toBe(1);
    }
  });
});

describe("safeEasing — CSS linear() fallback for old engines", () => {
  it("passes linear() through when the engine supports it", () => {
    expect(safeEasing("linear(0, 0.5, 1)", true)).toBe("linear(0, 0.5, 1)");
    expect(safeEasing(SLOT_EASING, true)).toBe(SLOT_EASING);
  });

  it("swaps linear() for the bezier fallback when unsupported", () => {
    expect(safeEasing("linear(0, 0.5, 1)", false)).toBe(FALLBACK_EASING);
    expect(safeEasing(SLOT_EASING, false)).toBe(FALLBACK_EASING);
    expect(safeEasing(SLOT_EASING_SOFT, false)).toBe(FALLBACK_EASING);
  });

  it("leaves non-linear easings alone even when linear() is unsupported", () => {
    expect(safeEasing("ease", false)).toBe("ease");
    expect(safeEasing("cubic-bezier(.1,.2,.3,.4)", false)).toBe(
      "cubic-bezier(.1,.2,.3,.4)",
    );
  });

  it("supportsLinearEasing returns a boolean and never throws", () => {
    // Must degrade gracefully where `CSS`/`CSS.supports` is absent (SSR, the
    // test runtime) rather than throw — that's the whole point of the guard.
    expect(typeof supportsLinearEasing()).toBe("boolean");
  });

  it("the fallback bezier itself has no overshoot (control y ≤ 1)", () => {
    const m = FALLBACK_EASING.match(/cubic-bezier\(([^)]+)\)/);
    expect(m).not.toBeNull();
    const [, y1, , y2] = (m?.[1] ?? "")
      .split(",")
      .map((n) => Number.parseFloat(n));
    expect(y1).toBeLessThanOrEqual(1);
    expect(y2).toBeLessThanOrEqual(1);
  });
});

describe("segmentWithOffsets", () => {
  it("splits all-ASCII text one code unit per cluster (the fast path)", () => {
    const out = segmentWithOffsets("$1,234.56");
    expect(out.map((s) => s.g).join("")).toBe("$1,234.56");
    expect(out).toHaveLength(9);
    expect(out.map((s) => s.start)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("segments CJK and keeps correct offsets", () => {
    const out = segmentWithOffsets("東京タワー");
    expect(out.map((s) => s.g)).toEqual(["東", "京", "タ", "ワ", "ー"]);
    expect(out.map((s) => s.start)).toEqual([0, 1, 2, 3, 4]);
  });

  it("offsets always reconstruct the source slice for every cluster", () => {
    for (const text of ["$1,234.56", "東京タワー", "A中b", "Z9", "🍒🔔", ""]) {
      for (const { g, start } of segmentWithOffsets(text)) {
        expect(text.slice(start, start + g.length)).toBe(g);
      }
      // No glyph is dropped: concatenation round-trips.
      expect(
        segmentWithOffsets(text)
          .map((s) => s.g)
          .join(""),
      ).toBe(text);
    }
  });

  it("keeps surrogate-pair (astral) code points intact", () => {
    // 𝟙 (U+1D7D9) is a 2-code-unit math digit — must stay one cluster.
    const out = segmentWithOffsets("a𝟙b");
    expect(out.map((s) => s.g)).toEqual(["a", "𝟙", "b"]);
    expect(out[2]?.start).toBe(3); // "a"(1) + surrogate pair(2)
  });
});
