/**
 * sloteffect — internal generic reel component.
 *
 * Renders a clipped vertical strip of three charset copies and rolls between
 * glyphs on change, up or down per `direction`, wrapping through the charset
 * ends. After each roll it snaps (no animation) back to the canonical
 * middle-copy index so the strip never drifts. Honors `prefers-reduced-motion`.
 *
 * Not part of the public API — `SlotNumber`, `SlotText`, and `SlotLetter` use it.
 */
import { useLayoutEffect, useRef } from "react";
import {
  REEL_COPIES,
  resolveTargetIndex,
  rollDuration,
  SLOT_EASING,
  type SlotDirection,
} from "./reel";

const CELL: React.CSSProperties = {
  display: "block",
  height: "1em",
  lineHeight: "1em",
};

interface ReelProps {
  /** The charset this reel rolls through (e.g. "0123456789"). */
  charset: string;
  /** The currently displayed glyph; must be a member of `charset`. */
  glyph: string;
  /** Roll direction; `both` randomizes per transition. */
  direction: SlotDirection;
}

export function Reel({ charset, glyph, direction }: ReelProps) {
  const stripRef = useRef<HTMLSpanElement>(null);
  const length = charset.length;
  const index = charset.indexOf(glyph);
  const prevRef = useRef(index);
  // Three copies so a reel can wrap in either direction; home copy starts at L.
  const strip = charset.repeat(REEL_COPIES);

  useLayoutEffect(() => {
    const el = stripRef.current;
    const from = prevRef.current;
    const to = index;
    prevRef.current = to;
    if (!el || to < 0) return;

    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (from === to || from < 0 || reduce) {
      el.style.transform = `translateY(${-(length + to)}em)`;
      return;
    }

    const fromIdx = length + from;
    const toIdx = resolveTargetIndex(
      fromIdx,
      length + to,
      length,
      direction,
      Math.random(),
    );

    for (const a of el.getAnimations()) a.cancel();
    el.style.transform = `translateY(${-toIdx}em)`; // final (pre-snap) state
    const anim = el.animate(
      [
        { transform: `translateY(${-fromIdx}em)` },
        { transform: `translateY(${-toIdx}em)` },
      ],
      { duration: rollDuration(), easing: SLOT_EASING },
    );
    // Snap back to the canonical middle-copy index (same glyph, no visual jump).
    anim.onfinish = () => {
      el.style.transform = `translateY(${-(length + to)}em)`;
    };
  }, [index, length, direction]);

  return (
    <span
      aria-hidden="true"
      style={{ display: "block", overflow: "hidden", height: "1em" }}
    >
      <span
        ref={stripRef}
        style={{
          display: "block",
          transform: `translateY(${-(length + Math.max(index, 0))}em)`,
        }}
      >
        {Array.from(strip).map((ch, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static strip
          <span key={i} style={CELL}>
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}
