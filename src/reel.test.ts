import { describe, expect, it } from "vitest";
import {
  buildRoll,
  charsetOf,
  DIGITS,
  LOWER,
  rollDuration,
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

describe("rollDuration", () => {
  it("is BASE at coin 0 and BASE+JITTER at coin 1", () => {
    expect(rollDuration(0)).toBe(750);
    expect(rollDuration(1)).toBe(1050);
  });
});
