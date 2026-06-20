# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10"]
# ///
"""Render a small looping clip of how SlotNumber animates, as an animated WebP.

This is a faithful, offline port of the live effect: each digit is its own reel
that rolls (up, through 0-9) from a start glyph to its target with the shared
underdamped-spring easing; the `$` and `,` stay static. Output auto-plays and
loops in any browser via an <img>/<video poster> — no ffmpeg required.

Usage:
    uv run scripts/make_demo_movie.py [--out assets/slotnumber.webp] [--verbose]
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --- palette (matches the demo's dark theme tokens) -------------------------
BG = (21, 24, 29)  # --surface  #15181d
FG = (244, 243, 240)  # --text     #f4f3f0

# --- geometry ---------------------------------------------------------------
SS = 2  # supersample factor for crisp text, downscaled at the end
FONT_SIZE = 132
ROW_H = round(FONT_SIZE * 1.3)  # reel row height (matches ROW_H = 1.3em)
CANVAS_W = 760
CANVAS_H = 280
FONT_PATH = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"

# --- timing -----------------------------------------------------------------
FPS = 30
ROLL_FRAMES = 28
HOLD_FRAMES = 14

DIGITS = "0123456789"
VALUES = ["$1,234", "$5,678", "$9,012", "$3,141"]
# Per-position spin distance (steady duration, varied starts → settle together,
# i.e. the default randomSpin=false behavior).
SPINS = [7, 10, 6, 9, 8, 11]


def spring(p: float) -> float:
    """Underdamped spring (ζ=0.68, ω_d=3π): ~5% overshoot, settles by p=1."""
    if p >= 1:
        return 1.0
    z, wd = 0.68, 3 * math.pi
    w = wd / math.sqrt(1 - z * z)
    return 1 - math.exp(-z * w * p) * (
        math.cos(wd * p) + (z * w / wd) * math.sin(wd * p)
    )


def build_roll(target: str, spin: int, roll_up: bool) -> tuple[list[str], int, int]:
    """Mirror the component's buildRoll for a digit reel.

    Returns (rows, start_row, end_row): the glyphs stacked top→bottom plus which
    row is shown at the start and end of the roll. `roll_up` rolls forward
    (digits increase); otherwise it rolls the other way (reversed path).
    """
    ti = DIGITS.index(target)
    if roll_up:
        rows = [DIGITS[(ti - spin + k) % 10] for k in range(spin + 1)]
        return rows, 0, len(rows) - 1
    # roll down: path target→…→start, reversed so it travels the opposite way
    path = [DIGITS[(ti + spin - k) % 10] for k in range(spin + 1)]
    rows = path[::-1]
    return rows, len(rows) - 1, 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="assets/slotnumber.webp", type=Path)
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    font = ImageFont.truetype(FONT_PATH, FONT_SIZE * SS)
    digit_w = max(font.getlength(d) for d in DIGITS)  # uniform → stable layout
    row_h = ROW_H * SS

    def char_w(ch: str) -> float:
        return digit_w if ch.isdigit() else font.getlength(ch)

    def layout(value: str) -> list[tuple[str, float]]:
        total = sum(char_w(c) for c in value)
        x = (CANVAS_W * SS - total) / 2
        out = []
        for c in value:
            out.append((c, x))
            x += char_w(c)
        return out

    def draw_glyph(img: Image.Image, ch: str, x: float, cy: float, w: float) -> None:
        d = ImageDraw.Draw(img)
        d.text((x + w / 2, cy), ch, font=font, fill=FG, anchor="mm")

    def render(value: str, progress: float | None, trans: int) -> Image.Image:
        """One frame. progress None = static; else 0..1 roll into `value`.

        `trans` seeds the per-digit roll direction so a mix of digits roll up and
        down (direction="both", the default).
        """
        img = Image.new("RGB", (CANVAS_W * SS, CANVAS_H * SS), BG)
        cy = CANVAS_H * SS / 2
        digit_i = 0
        for ch, x in layout(value):
            if not ch.isdigit():
                draw_glyph(img, ch, x, cy, char_w(ch))
                continue
            if progress is None:
                draw_glyph(img, ch, x, cy, digit_w)
            else:
                spin = SPINS[digit_i % len(SPINS)]
                roll_up = (digit_i + trans) % 2 == 0  # mix of up/down per change
                rows, start_row, end_row = build_roll(ch, spin, roll_up)
                pos = start_row + spring(progress) * (end_row - start_row)
                cell = Image.new("RGB", (round(digit_w), row_h), BG)
                for i, g in enumerate(rows):
                    ImageDraw.Draw(cell).text(
                        (digit_w / 2, row_h / 2 + (i - pos) * row_h), g,
                        font=font, fill=FG, anchor="mm",
                    )
                img.paste(cell, (round(x), round(cy - row_h / 2)))
            digit_i += 1
        return img.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)

    frames: list[Image.Image] = [render(VALUES[0], None, 0) for _ in range(HOLD_FRAMES)]
    targets = VALUES[1:] + VALUES[:1]
    for ti, target in enumerate(targets):
        for f in range(1, ROLL_FRAMES + 1):
            frames.append(render(target, f / ROLL_FRAMES, ti))
        # Drop the final hold so the loop is seamless (it equals the first hold).
        holds = HOLD_FRAMES if ti != len(targets) - 1 else 0
        frames.extend(render(target, None, ti) for _ in range(holds))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        args.out,
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        format="WEBP",
        quality=82,
        method=6,
    )
    kb = args.out.stat().st_size / 1024
    print(f"wrote {args.out} — {len(frames)} frames, {kb:.0f} KB")
    if args.verbose:
        print(f"  {CANVAS_W}x{CANVAS_H} @ {FPS}fps, font={FONT_PATH}")


if __name__ == "__main__":
    main()
