/**
 * sloteffect — SlotText (and the engine behind SlotLetter/SlotNumber).
 *
 * A hidden text run (kept for sizing, kerning and accessibility) is measured to
 * find each grapheme's real, kerned box. Every animatable grapheme then gets an
 * absolutely-positioned reel placed on that box; the reel spins from a random
 * same-kind glyph and *lands on its own glyph and stays there*. Because the reel
 * that animates is also the reel shown at rest, nothing is ever swapped out at
 * the end — so characters never shift, in any axis, once the roll settles.
 *
 * Each value is a self-contained animation: the previous reels are wiped and the
 * new text spins in from scratch (no morph from one value to the next). Digits
 * and same-case Latin letters roll their charset, ideographs and other scripts
 * spin through random in-script glyphs; symbols (currency, separators, spaces)
 * and emoji never spin. Honors `prefers-reduced-motion`.
 */
import { type CSSProperties, useLayoutEffect, useRef } from "react";
import {
  buildRoll,
  chooseReel,
  DEFAULT_SPIN_POOL,
  glyphKind,
  hashSeed,
  makeRng,
  prefersReducedMotion,
  ROW_H,
  rollDuration,
  SLOT_EASING,
  type SlotDirection,
} from "./reel";

/** Steady (un-jittered) roll duration used when `randomSpin` is off. */
const STEADY_COIN = 0.5;

interface Grapheme {
  g: string;
  start: number;
}

// One grapheme segmenter for the whole module — constructing one per call is
// surprisingly costly, and it is stateless, so it is safe to reuse.
const SEGMENTER =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Split into grapheme clusters with their UTF-16 offsets (for Range probing). */
function segmentWithOffsets(text: string): Grapheme[] {
  const out: Grapheme[] = [];
  if (SEGMENTER) {
    for (const s of SEGMENTER.segment(text))
      out.push({ g: s.segment, start: s.index });
    return out;
  }
  let i = 0;
  for (const ch of text) {
    out.push({ g: ch, start: i });
    i += ch.length;
  }
  return out;
}

/** Nearest opaque background color, so a rolling reel hides the glyph beneath it. */
function resolveBackground(el: HTMLElement): string {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0"))
      return bg;
    node = node.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor || "#fff";
}

export interface SlotTextProps {
  /** The string (or number) to display. */
  text: string | number | bigint;
  /** Roll direction; defaults to `both` (random per cell). */
  direction?: SlotDirection;
  /**
   * Text direction. `auto` (default) infers LTR/RTL from the content; pass
   * `ltr`/`rtl` to force it.
   */
  dir?: "auto" | "ltr" | "rtl";
  /** Glyph pool ideographs spin through. Defaults to common Hanzi. */
  spinPool?: string;
  /**
   * When `false` (default) a value spins the same way every time and all
   * characters settle at the same rate. When `true`, each character starts and
   * settles randomly (a staggered roll that differs on every play).
   */
  randomSpin?: boolean;
  /** Optional class on the container. */
  className?: string;
  /** Optional inline style merged onto the container. */
  style?: CSSProperties;
}

export function SlotText({
  text,
  direction = "both",
  dir = "auto",
  spinPool = DEFAULT_SPIN_POOL,
  randomSpin = false,
  className,
  style,
}: SlotTextProps) {
  const label = String(text);
  const hostRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);
  const cellsRef = useRef<HTMLSpanElement[]>([]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const textEl = textRef.current;
    const layer = layerRef.current;
    if (!host || !textEl || !layer) return;

    // Wipe the previous value's reels before spinning this one in.
    const wipe = () => {
      for (const c of cellsRef.current) {
        for (const a of c.getAnimations({ subtree: true })) a.cancel();
        c.remove();
      }
      cellsRef.current = [];
    };
    wipe();

    const node = textEl.firstChild;
    if (!node || prefersReducedMotion()) {
      // Show the real (kerned) text; nothing animates.
      textEl.style.visibility = "visible";
      return wipe;
    }

    // Off → a per-value seed makes the roll identical every play; on → truly
    // random each play. `rand` drives the start glyph, spin glyphs, direction.
    const rand = randomSpin ? Math.random : makeRng(hashSeed(label));

    const toG = segmentWithOffsets(label);
    const hostRect = host.getBoundingClientRect();
    const bg = resolveBackground(host);
    // A grapheme's Range rect is its em box, but a reel row centers its glyph
    // within ROW_H (adding half-leading). Lift each cell by that half-leading so
    // the reel sits exactly on the measured glyph box.
    const lead =
      ((ROW_H - 1) / 2) * parseFloat(getComputedStyle(host).fontSize);

    // Other-script letters spin through this value's own same-kind glyphs, so a
    // roll uses in-script characters (e.g. CJK through CJK).
    const letterPool = [
      ...new Set(toG.map((x) => x.g).filter((g) => glyphKind(g) === "letter")),
    ];

    // Measure every grapheme's kerned box first (reads), then build all cells
    // (writes), so a long string doesn't trigger a forced reflow per glyph.
    interface Plan {
      g: string;
      reel: ReturnType<typeof chooseReel>;
      rect: DOMRect;
    }
    const plans: Plan[] = [];
    for (const grapheme of toG) {
      const reel = chooseReel(grapheme.g, null, letterPool, spinPool, rand);
      // Whitespace has no ink and never animates — skip it entirely.
      if (!reel && grapheme.g.trim() === "") continue;
      const range = document.createRange();
      range.setStart(node, grapheme.start);
      range.setEnd(node, grapheme.start + grapheme.g.length);
      plans.push({ g: grapheme.g, reel, rect: range.getBoundingClientRect() });
    }

    // Hide the measured text; the cells are now the visible, resting glyphs.
    textEl.style.visibility = "hidden";

    const cells: HTMLSpanElement[] = [];
    const at = (i: number) => `translateY(${-(i * ROW_H)}em)`;
    for (const { g, reel, rect } of plans) {
      const cell = document.createElement("span");
      cell.setAttribute("aria-hidden", "true");
      const left = rect.left - hostRect.left;
      const top = rect.top - hostRect.top;

      if (!reel) {
        // A symbol (currency, separator, punctuation): render it statically.
        cell.style.cssText = `position:absolute;left:${left}px;top:${top}px;line-height:1;white-space:pre`;
        cell.textContent = g;
        layer.appendChild(cell);
        cells.push(cell);
        continue;
      }

      cell.style.cssText = `position:absolute;left:${left}px;top:${top - lead}px;width:${rect.width}px;height:${ROW_H}em;overflow:hidden;background:${bg}`;
      const { rows, startRow, endRow } = buildRoll(
        reel.from,
        g,
        direction,
        rand(),
        reel.fill,
      );
      // One multi-line text node — each line is a ROW_H-tall reel row — instead
      // of a span per glyph. Same layout, but O(1) DOM nodes per reel instead of
      // O(path length), so long rolls cost no extra nodes.
      const strip = document.createElement("span");
      strip.style.cssText = `position:absolute;left:0;top:0;width:100%;white-space:pre;line-height:${ROW_H};will-change:transform`;
      strip.textContent = rows.join("\n");
      cell.appendChild(strip);
      // Land on the final glyph and stay — the reel itself is the rest state.
      strip.style.transform = at(endRow);
      // randomSpin staggers each character's settle; otherwise all settle as one.
      const duration = rollDuration(randomSpin ? Math.random() : STEADY_COIN);
      // Keep the strip promoted (will-change stays) so finishing the roll never
      // triggers a layer de-promotion repaint — which reads as a final flicker.
      strip.animate([{ transform: at(startRow) }, { transform: at(endRow) }], {
        duration,
        easing: SLOT_EASING,
      });
      layer.appendChild(cell);
      cells.push(cell);
    }

    cellsRef.current = cells;
    return wipe;
  }, [label, direction, spinPool, randomSpin]);

  return (
    <span
      ref={hostRef}
      role="img"
      aria-label={label}
      dir={dir}
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        whiteSpace: "pre",
        lineHeight: ROW_H,
        fontKerning: "normal",
        textRendering: "optimizeLegibility",
        ...style,
      }}
    >
      <span ref={textRef}>{label}</span>
      <span
        ref={layerRef}
        aria-hidden="true"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      />
    </span>
  );
}
