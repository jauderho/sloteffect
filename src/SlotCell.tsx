/**
 * sloteffect — internal slot cell.
 *
 * Renders a single glyph at its natural width. When the glyph changes it builds
 * a transient rolling strip imperatively (no React re-render mid-animation),
 * rolls it up or down per `direction`, then removes it — leaving just the glyph.
 *
 * At rest a cell is one glyph element, so spacing, kerning, bidi/RTL ordering,
 * and arbitrary scripts/emoji all come from normal text layout. Not part of the
 * public API — `SlotNumber`, `SlotText`, and `SlotLetter` use it.
 */
import { type CSSProperties, useLayoutEffect, useRef } from "react";
import {
  buildRoll,
  prefersReducedMotion,
  ROW_H,
  rollDuration,
  SLOT_EASING,
  type SlotDirection,
} from "./reel";

const HOST_STYLE: CSSProperties = {
  position: "relative",
  display: "inline-block",
  overflow: "hidden",
  height: `${ROW_H}em`,
  lineHeight: 1,
  verticalAlign: "middle",
  whiteSpace: "pre",
};

// A row is a flex box so the glyph is vertically centered with headroom for
// ascenders/descenders (the cell is taller than 1em — see ROW_H).
const ROW_CSS = `display:flex;align-items:center;justify-content:center;height:${ROW_H}em;line-height:1`;

const GLYPH_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: `${ROW_H}em`,
  lineHeight: 1,
};

interface SlotCellProps {
  /** The glyph to display. */
  glyph: string;
  /** Roll direction; `both` randomizes per transition. */
  direction: SlotDirection;
}

export function SlotCell({ glyph, direction }: SlotCellProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);
  const rollerRef = useRef<HTMLSpanElement | null>(null);
  const prevRef = useRef(glyph);

  useLayoutEffect(() => {
    const from = prevRef.current;
    const to = glyph;
    prevRef.current = to;
    const host = hostRef.current;
    const rest = glyphRef.current;
    if (!host || !rest) return;

    // Tear down any in-flight roll and reveal the resting glyph.
    const clear = () => {
      const roller = rollerRef.current;
      if (roller) {
        for (const a of roller.getAnimations()) a.cancel();
        roller.remove();
        rollerRef.current = null;
      }
      rest.style.visibility = "";
    };

    if (from === to || prefersReducedMotion()) {
      clear();
      return;
    }
    clear();

    const { rows, startRow, endRow } = buildRoll(
      from,
      to,
      direction,
      Math.random(),
    );

    const roller = document.createElement("span");
    roller.setAttribute("aria-hidden", "true");
    roller.style.cssText =
      "position:absolute;left:0;top:0;width:100%;will-change:transform";
    for (const ch of rows) {
      const row = document.createElement("span");
      row.style.cssText = ROW_CSS;
      row.textContent = ch;
      roller.appendChild(row);
    }

    rest.style.visibility = "hidden"; // keeps width; roller's last row shows `to`
    host.appendChild(roller);
    rollerRef.current = roller;

    const at = (i: number) => `translateY(${-(i * ROW_H)}em)`;
    roller.style.transform = at(endRow);
    const anim = roller.animate(
      [{ transform: at(startRow) }, { transform: at(endRow) }],
      { duration: rollDuration(), easing: SLOT_EASING },
    );
    anim.onfinish = () => {
      if (rollerRef.current === roller) clear();
    };

    return clear;
  }, [glyph, direction]);

  return (
    <span ref={hostRef} style={HOST_STYLE}>
      <span ref={glyphRef} style={GLYPH_STYLE}>
        {glyph}
      </span>
    </span>
  );
}
