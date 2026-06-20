import { describe, expect, it } from "vitest";
import { DIGITS, resolveTargetIndex, rollDuration, UPPER } from "./reel";

// Digit charset: L = 10, home copy occupies indices 10..19.
const L10 = DIGITS.length;
// Letter charset: L = 26, home copy occupies indices 26..51.
const L26 = UPPER.length;

describe("resolveTargetIndex — direction up", () => {
  it("rolls forward when target is already ahead", () => {
    // 3 -> 7 (digits): from 13, to 17, no wrap needed.
    expect(resolveTargetIndex(13, 17, L10, "up", 0)).toBe(17);
  });

  it("wraps into the upper copy when target is behind", () => {
    // 7 -> 3 rolling up must pass through 8,9,0,1,2,3: borrow +L.
    expect(resolveTargetIndex(17, 13, L10, "up", 0)).toBe(23);
  });

  it("wraps a same-glyph full revolution up", () => {
    // 5 -> 5 rolling up is a full loop: +L.
    expect(resolveTargetIndex(15, 15, L10, "up", 0)).toBe(25);
  });
});

describe("resolveTargetIndex — direction down", () => {
  it("rolls backward when target is already behind", () => {
    // 7 -> 3 (digits): from 17, to 13, no wrap needed.
    expect(resolveTargetIndex(17, 13, L10, "down", 0)).toBe(13);
  });

  it("wraps into the lower copy when target is ahead", () => {
    // 3 -> 7 rolling down must pass through 2,1,0,9,8,7: borrow -L.
    expect(resolveTargetIndex(13, 17, L10, "down", 0)).toBe(7);
  });
});

describe("resolveTargetIndex — direction both", () => {
  it("uses the up branch when coin < 0.5", () => {
    expect(resolveTargetIndex(17, 13, L10, "both", 0.1)).toBe(
      resolveTargetIndex(17, 13, L10, "up", 0),
    );
  });

  it("uses the down branch when coin >= 0.5", () => {
    expect(resolveTargetIndex(13, 17, L10, "both", 0.9)).toBe(
      resolveTargetIndex(13, 17, L10, "down", 0),
    );
  });
});

describe("resolveTargetIndex — letter charset (L=26)", () => {
  it("wraps up across the alphabet end (Z -> A)", () => {
    // Z=25 -> A=0 rolling up: from 51, to 26, borrow +26.
    expect(resolveTargetIndex(51, 26, L26, "up", 0)).toBe(52);
  });

  it("wraps down across the alphabet start (A -> Z)", () => {
    // A=0 -> Z=25 rolling down: from 26, to 51, borrow -26.
    expect(resolveTargetIndex(26, 51, L26, "down", 0)).toBe(25);
  });
});

describe("rollDuration", () => {
  it("is BASE at coin 0 and BASE+JITTER at coin 1", () => {
    expect(rollDuration(0)).toBe(750);
    expect(rollDuration(1)).toBe(1050);
  });
});
