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
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react";
import {
  buildRoll,
  charsetOf,
  chooseReel,
  DEFAULT_SPIN_POOL,
  DIGITS,
  glyphKind,
  hashSeed,
  makeRng,
  padOvershoot,
  prefersReducedMotion,
  ROW_H,
  rollDuration,
  SLOT_EASING,
  type SlotDirection,
  safeEasing,
  segmentWithOffsets,
} from "./reel";

/** Steady (un-jittered) roll duration used when `randomSpin` is off. */
const STEADY_COIN = 0.5;

/**
 * A build split into the scheduler's phases: `measure` (layout reads of the
 * hidden text), `mutate` (DOM writes — wipe old reels, build new ones),
 * `remeasure` (layout reads of the new strips), `commit` (transform writes and
 * animation starts). A cancelled job is skipped wholesale.
 */
interface BuildJob {
  cancelled: boolean;
  measure(): void;
  mutate(): void;
  remeasure(): void;
  commit(): void;
}

const buildQueue: BuildJob[] = [];
let flushQueued = false;

/**
 * Shared build scheduler. Alternating one instance's layout reads with
 * another's DOM writes forces a synchronous layout per instance — a page of
 * counters updating together would thrash layout 2×N times per frame. Instead
 * every build scheduled in the same task is flushed together in a microtask
 * (after React's commit, still before paint), one phase at a time across all
 * jobs, so a whole flush costs two forced layouts no matter how many slots
 * update at once. A bonus: several synchronous re-renders of one component
 * coalesce — the superseded builds are cancelled and never touch the DOM.
 */
function scheduleBuild(job: BuildJob): void {
  buildQueue.push(job);
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    const jobs = buildQueue.splice(0);
    for (const j of jobs) if (!j.cancelled) j.measure();
    for (const j of jobs) if (!j.cancelled) j.mutate();
    for (const j of jobs) if (!j.cancelled) j.remeasure();
    for (const j of jobs) if (!j.cancelled) j.commit();
  });
}

// Strips whose roll has finished, waiting to have `will-change` released.
// Batched the same way as scheduleBuild: every `anim.finished` that resolves
// in the same task is released together in one microtask, so a page whose
// counters all settle at once doesn't release one style per task.
const releaseQueue: HTMLElement[] = [];
let releaseQueued = false;
function scheduleRelease(strip: HTMLElement): void {
  releaseQueue.push(strip);
  if (releaseQueued) return;
  releaseQueued = true;
  queueMicrotask(() => {
    releaseQueued = false;
    for (const s of releaseQueue.splice(0)) s.style.willChange = "auto";
  });
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
  /**
   * Extra full revolutions for each successive digit cell (in reading order),
   * making lower-place digits spin faster. Used by `SlotNumber`'s `counter`
   * mode; see {@link odometerDigit}. Non-digit cells are unaffected.
   */
  digitCycles?: number[];
  /**
   * Explicit start glyph for each successive digit cell (in reading order) —
   * the value to roll *from*. When given, the digit rolls from this glyph
   * instead of a synthesized one; an unchanged digit with no extra revolutions
   * stays still. Used by `SlotNumber`'s odometer-style `counter` mode.
   */
  digitFrom?: string[];
  /** Settle curve (a CSS `linear()` easing). Defaults to {@link SLOT_EASING}. */
  easing?: string;
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
  digitCycles,
  digitFrom,
  easing = SLOT_EASING,
  className,
  style,
}: SlotTextProps) {
  const label = String(text);
  const hostRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);
  const cellsRef = useRef<HTMLSpanElement[]>([]);
  // Animations created by the current build, so a wipe can cancel them directly
  // instead of enumerating with getAnimations() — which walks the subtree and
  // allocates on every value change.
  const animsRef = useRef<Animation[]>([]);
  // The surface color baked onto the resting reel cells. Tracked so a theme
  // switch (which keeps the value, so the reels aren't rebuilt) can be detected
  // and repainted in place.
  const bgRef = useRef<string>("");

  useLayoutEffect(() => {
    const host = hostRef.current;
    const textEl = textRef.current;
    const layer = layerRef.current;
    if (!host || !textEl || !layer) return;

    // Wipe the previous value's reels before spinning this one in.
    const wipe = () => {
      for (const a of animsRef.current) a.cancel();
      animsRef.current = [];
      for (const c of cellsRef.current) c.remove();
      cellsRef.current = [];
    };

    // A grapheme's kerned box plus how (whether) it rolls.
    interface Plan {
      g: string;
      reel: ReturnType<typeof chooseReel>;
      rect: DOMRect;
      cycles: number;
    }
    interface Reel {
      strip: HTMLSpanElement;
      rowCount: number;
      landRow: number;
      firstRow: number;
      duration: number;
    }

    // One build = measure the hidden text, build the reels, measure the strips,
    // animate — split into the scheduler's four phases (see scheduleBuild) so
    // simultaneous instances share two forced layouts instead of two each.
    const makeJob = (): BuildJob => {
      // Off → a per-value seed makes the roll identical every play; on → truly
      // random each play. `rand` drives the start glyph, spin glyphs, direction.
      const rand = randomSpin ? Math.random : makeRng(hashSeed(label));
      let empty = false;
      let hostRect!: DOMRect;
      let bg = "";
      let plans: Plan[] = [];
      const cells: HTMLSpanElement[] = [];
      const reels: Reel[] = [];
      let advances: number[] = [];

      return {
        cancelled: false,

        // Layout reads: every grapheme's kerned box (via a Range against the
        // real, hidden text run), the host origin, and the surface color.
        measure() {
          textWidth = textEl.getBoundingClientRect().width;
          const node = textEl.firstChild;
          if (!node || prefersReducedMotion()) {
            empty = true;
            return;
          }
          const toG = segmentWithOffsets(label);
          hostRect = host.getBoundingClientRect();
          // Below (or above, or beside) the fold at build time: nobody sees
          // this roll, so skip it entirely and show the resting text — a
          // dashboard's off-screen rows would otherwise all build reels and
          // run 750–1050ms WAAPI animations at onload for no visible benefit,
          // competing for main-thread time with the rows that *are* visible.
          // A synchronous rect check (reusing the read just above — no extra
          // layout) rather than IntersectionObserver: IO's first callback is
          // asynchronous (a task, not this microtask flush), so it can't gate
          // the very first build, and a plain viewport test is exactly what a
          // default-root IO would report anyway. The element is left at rest
          // if it's later scrolled into view — it was hidden at load either
          // way, so there's nothing to animate into.
          if (
            hostRect.bottom < 0 ||
            hostRect.top > window.innerHeight ||
            hostRect.right < 0 ||
            hostRect.left > window.innerWidth
          ) {
            empty = true;
            return;
          }
          bg = resolveBackground(host);
          bgRef.current = bg;

          // Other-script letters spin through this value's own same-kind
          // glyphs, so a roll uses in-script characters (e.g. CJK through CJK).
          const letterPool = [
            ...new Set(
              toG.map((x) => x.g).filter((g) => glyphKind(g) === "letter"),
            ),
          ];

          // One Range reused across all graphemes — creating one per glyph
          // churns allocations on a path that reruns per value change.
          const range = document.createRange();
          plans = [];
          let digitIdx = 0;
          for (const grapheme of toG) {
            const isDigit = charsetOf(grapheme.g) === DIGITS;
            let cycles = 0;
            let reel: ReturnType<typeof chooseReel>;
            if (isDigit) {
              const i = digitIdx++;
              cycles = digitCycles?.[i] ?? 0;
              if (digitFrom) {
                // Odometer mode: roll from the supplied previous digit. An
                // unchanged digit with no extra revolutions holds still.
                const from = digitFrom[i] ?? grapheme.g;
                reel =
                  from === grapheme.g && cycles === 0
                    ? null
                    : { from, fill: [] };
              } else {
                reel = chooseReel(grapheme.g, null, letterPool, spinPool, rand);
              }
            } else {
              reel = chooseReel(grapheme.g, null, letterPool, spinPool, rand);
            }
            // Whitespace has no ink and never animates — skip it entirely.
            if (!reel && grapheme.g.trim() === "") continue;
            range.setStart(node, grapheme.start);
            range.setEnd(node, grapheme.start + grapheme.g.length);
            plans.push({
              g: grapheme.g,
              reel,
              rect: range.getBoundingClientRect(),
              cycles,
            });
          }
        },

        // DOM writes: drop the previous value's reels and build this one's.
        mutate() {
          wipe();
          if (empty) {
            // Show the real (kerned) text; nothing animates.
            textEl.style.visibility = "visible";
            return;
          }
          // Hide the measured text; the cells are the visible, resting glyphs.
          textEl.style.visibility = "hidden";

          // Each rolling reel is one multi-line text node (O(1) DOM nodes per
          // reel, ~30× cheaper to build than a span per row — which matters for
          // the long strips counter mode spins through). Its rows are spaced by
          // the font's real line box, which can exceed `line-height` (notably
          // Safari/CoreText with tall serifs), so the strip is stepped by the
          // *measured* row advance rather than an assumed ROW_H — the landing
          // row then lines up in every engine.
          // Cells are collected in a fragment and attached with one
          // appendChild, so the live DOM is touched once per build.
          const frag = document.createDocumentFragment();
          for (const { g, reel, rect, cycles } of plans) {
            const cell = document.createElement("span");
            cell.setAttribute("aria-hidden", "true");
            const left = rect.left - hostRect.left;

            if (!reel) {
              // A symbol (currency, separator, punctuation): render statically,
              // at its own measured top (`line-height:1`, so this glyph's own
              // box — not a shared ROW_H row — is what has to line up).
              const top = rect.top - hostRect.top;
              cell.style.cssText = `position:absolute;left:${left}px;top:${top}px;line-height:1;white-space:pre`;
              cell.textContent = g;
              frag.appendChild(cell);
              cells.push(cell);
              continue;
            }

            // A rolling cell's row box is the *host's* line box (both are one
            // line, `line-height: ROW_H`), not the grapheme's own measured Range
            // box — so it sits flush with the host's top, always. This matters
            // because a Range rect reflects a glyph's own font metrics, and in
            // Firefox a fallback font (e.g. CJK, when the host's font doesn't
            // cover it) can report a Range box that is *not* centered within the
            // shared line box the way the primary font's is (its ascent/descent
            // split differs) — anchoring on that rect's `top` would then place
            // the reel off by however far that glyph's box is decentered,
            // exactly reproducing Firefox's real-vs-hidden misalignment for
            // ideographs. The strip inside renders through that same shared line
            // box (same host font context), so whatever a glyph's own offset
            // from the row's top is, it is identical in the hidden text and in
            // the strip — no measurement of it is needed at all.
            //
            // `contain:strict` lets the engine clip the (often very tall)
            // strip to this fixed-size window and skip rasterizing its
            // off-screen rows.
            cell.style.cssText = `position:absolute;left:${left}px;top:0;width:${rect.width}px;height:${ROW_H}em;overflow:hidden;contain:strict;background:${bg}`;
            const roll = buildRoll(
              reel.from,
              g,
              direction,
              rand(),
              reel.fill,
              cycles,
            );
            // Pad the strip past its landing row with the landing glyph so the
            // spring easing's overshoot slides through that glyph instead of
            // empty space (see padOvershoot).
            const { rows, firstRow, landRow } = padOvershoot(
              roll.rows,
              roll.startRow,
              roll.endRow,
            );
            const strip = document.createElement("span");
            strip.style.cssText = `position:absolute;left:0;top:0;width:100%;white-space:pre;line-height:${ROW_H};will-change:transform`;
            strip.textContent = rows.join("\n");
            cell.appendChild(strip);
            frag.appendChild(cell);
            cells.push(cell);
            // randomSpin staggers each character's settle; otherwise all
            // settle as one.
            reels.push({
              strip,
              rowCount: rows.length,
              landRow,
              firstRow,
              duration: rollDuration(randomSpin ? Math.random() : STEADY_COIN),
            });
          }
          layer.appendChild(frag);
          cellsRef.current = cells;
        },

        // Layout reads: the rendered row advance per strip — total height over
        // row count, so it reflects the real line box, not ROW_H.
        remeasure() {
          advances = reels.map(
            (r) => r.strip.getBoundingClientRect().height / r.rowCount,
          );
        },

        // Writes: land on the final glyph and stay (the reel itself is the
        // rest state), then play the roll. safeEasing falls back from CSS
        // linear() on engines that can't parse it.
        commit() {
          const settle = safeEasing(easing);
          reels.forEach((r, i) => {
            const adv = advances[i] as number;
            const at = (row: number) => `translateY(${-(row * adv)}px)`;
            r.strip.style.transform = at(r.landRow);
            const anim = r.strip.animate(
              [{ transform: at(r.firstRow) }, { transform: at(r.landRow) }],
              { duration: r.duration, easing: settle },
            );
            animsRef.current.push(anim);
            // Release the composited layer once the roll settles — a page
            // with many slots would otherwise hold one persistent layer per
            // digit forever (memory + raster pressure that peaks right at
            // onload, when the most instances are animating at once). Wiped
            // on the next value change regardless (wipe() removes the whole
            // strip element and mutate() creates a fresh one, promoted
            // again), so this can't race a re-roll — it only ever touches a
            // strip that's done animating and staying put. Verified
            // pixel-identical before/after release in Chromium (screenshot
            // diff); Safari/Firefox need the orchestrator's eyes-on check,
            // since a real flicker there would be a regression this can't
            // detect from geometry alone.
            anim.finished.then(() => scheduleRelease(r.strip)).catch(() => {});
          });
        },
      };
    };

    // The hidden text run's width as of the last build — the cheap "did the
    // text reflow" probe for the font-load rebuild below.
    let textWidth = 0;
    // Queue a (re)build, superseding one still waiting in the current flush.
    let pending: BuildJob | null = null;
    const build = () => {
      if (pending) pending.cancelled = true;
      pending = makeJob();
      scheduleBuild(pending);
    };

    build();

    // Rebuild once fonts are ready (no-op if already loaded) — boxes first
    // measured against a fallback font would otherwise leave the cells (and
    // the cents group) mispositioned. Then clean up.
    //
    // Guarded the same way as the loadingdone handler below: rebuild only if
    // the hidden text's measured width actually changed. Unguarded, this path
    // rebuilds unconditionally on every mount where a font is mid-load —
    // which for most apps means *every* SlotText restarts its roll mid-flight
    // right at onload (a visible stutter), even when the eventual face is
    // metric-compatible with the fallback (system fonts, tabular numbers) and
    // the layout never actually moves.
    let active = true;
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    if (fonts && fonts.status !== "loaded") {
      fonts.ready.then(() => {
        if (!active) return;
        const now = textEl.getBoundingClientRect().width;
        if (now === textWidth) return;
        build();
      });
    }
    // `fonts.status` can read "loaded" before a face has even *started*
    // loading — a face only starts when text first uses it, which can be this
    // very mount (Firefox kicks the fetch off after these effects run, so the
    // guard above sees "loaded" and never rebuilds). Catch late loads too:
    // whenever a face finishes, rebuild — but only if the text actually
    // reflowed, so unrelated font loads don't replay the roll.
    let onFontsDone: (() => void) | null = null;
    if (fonts) {
      onFontsDone = () => {
        if (!active) return;
        const now = textEl.getBoundingClientRect().width;
        if (now === textWidth) return;
        build();
      };
      fonts.addEventListener?.("loadingdone", onFontsDone);
    }

    return () => {
      active = false;
      if (pending) pending.cancelled = true;
      if (fonts && onFontsDone)
        fonts.removeEventListener?.("loadingdone", onFontsDone);
      wipe();
    };
  }, [label, direction, spinPool, randomSpin, digitCycles, digitFrom, easing]);

  // Keep the baked surface color in sync with the surroundings. A reel cell is
  // painted with the nearest opaque background so it hides the glyph beneath it;
  // because the reels are only rebuilt when the *value* changes, a theme switch
  // (same value, new surface) would otherwise leave every cell in the previous
  // theme's color. A theme is usually applied by flipping a class or data-attr
  // on <html>/<body>, often from a parent effect that runs *after* this
  // component's effects — so we can't catch it within the same render. Instead,
  // observe those roots (and the system color-scheme) and repaint the resting
  // cells in place when the resolved surface actually moves — no re-roll. The
  // background-equality guard makes unrelated mutations a cheap no-op.
  useEffect(() => {
    const repaint = () => {
      const host = hostRef.current;
      if (!host || cellsRef.current.length === 0) return;
      const bg = resolveBackground(host);
      if (bg === bgRef.current) return;
      bgRef.current = bg;
      for (const c of cellsRef.current) {
        if (c.style.background) c.style.background = bg;
      }
    };
    const obs = new MutationObserver(repaint);
    const opts = { attributes: true };
    obs.observe(document.documentElement, opts);
    if (document.body) obs.observe(document.body, opts);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", repaint);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.("change", repaint);
    };
  }, []);

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
