import { describe, expect, it } from "vitest";
import {
  buildRoll,
  charsetOf,
  chooseReel,
  DEFAULT_SPIN_POOL,
  DIGITS,
  glyphKind,
  hashSeed,
  isEmoji,
  isIdeograph,
  LOWER,
  makeRng,
  randomGlyph,
  rollDuration,
  SPIN_LENGTH,
  STATIC_KINDS,
  sampleSpin,
  UPPER,
} from "./reel";

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
