/**
 * A/B benchmark harness: baseline (bench/.work/baseline/src) vs current
 * (bench/.work/current/src) interleaved in one page load, several rounds,
 * medians reported — controls for page-level state and thermal/GC noise
 * that plagues separate-page-load comparisons (±50% variance observed).
 *
 * Methodology notes (see bench/README.md for the full rationale):
 *  - Both kits must resolve "react"/"react-dom" to the SAME copy (this repo's
 *    node_modules) or the library's useLayoutEffect build never runs and this
 *    only measures vdom diffing (~1.5ms) instead of the real DOM build
 *    (~25ms). bench/run.ts verifies this after bundling.
 *  - Each iteration is flushSync(render) followed by a queueMicrotask tick,
 *    because the library defers its DOM build to a queueMicrotask flush
 *    (see scheduleBuild in src/SlotText.tsx); the tick lets that flush land
 *    inside the measured window.
 *  - Start is gated on a short setTimeout, never requestAnimationFrame —
 *    rAF never fires in a backgrounded tab, which would hang the benchmark.
 */
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  SlotNumber as NumBaseline,
  SlotText as TextBaseline,
} from "./.work/baseline/src/index";
import {
  SlotNumber as NumCurrent,
  SlotText as TextCurrent,
} from "./.work/current/src/index";

declare global {
  interface Window {
    __abResults?: Record<string, string>;
    __benchDone?: boolean;
    __benchError?: string;
  }
}

const LONG_TEXT = "The Quick Brown Fox 12345 jumps over 67890 Lazy Dogs ABCXYZ";
const CJK_TEXT = "股票代碼 7203 豐田汽車 上漲 3.5% 收盤價 2891 日圓";

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

type Kit = { Text: typeof TextBaseline; Num: typeof NumBaseline };

const KITS: Record<"baseline" | "current", Kit> = {
  baseline: { Text: TextBaseline, Num: NumBaseline },
  current: { Text: TextCurrent, Num: NumCurrent },
};

const VERSIONS = ["baseline", "current"] as const;
type Version = (typeof VERSIONS)[number];

const SCENARIOS = [
  "long-text",
  "cjk-text",
  "counter-churn",
  "mount-24",
] as const;
type ScenarioName = (typeof SCENARIOS)[number];

const samples: Record<string, number[]> = {};

async function scenario(
  name: ScenarioName,
  version: Version,
  iters: number,
  render: (root: Root, kit: Kit, i: number) => void,
): Promise<void> {
  const kit = KITS[version];
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("missing #stage element");
  const el = document.createElement("div");
  stage.appendChild(el);
  const root = createRoot(el);
  const key = `${name}/${version}`;
  samples[key] = samples[key] ?? [];
  // warmup — excluded from measurement, primes JIT + first-mount cost.
  render(root, kit, -1);
  await tick();
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    render(root, kit, i);
    await tick();
    (samples[key] as number[]).push(performance.now() - t0);
  }
  root.unmount();
  el.remove();
  await tick();
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

async function run(): Promise<void> {
  const fmt: Intl.NumberFormatOptions = { style: "currency", currency: "USD" };
  const ROUNDS = 4;
  for (let round = 0; round < ROUNDS; round++) {
    for (const version of VERSIONS) {
      await scenario("long-text", version, 12, (root, kit, i) =>
        flushSync(() => root.render(<kit.Text text={`${LONG_TEXT} ${i}`} />)),
      );
      await scenario("cjk-text", version, 12, (root, kit, i) =>
        flushSync(() => root.render(<kit.Text text={`${CJK_TEXT}${i}`} />)),
      );
      await scenario("counter-churn", version, 40, (root, kit, i) =>
        flushSync(() =>
          root.render(
            <kit.Num
              value={1234567.89 + i * 137.41}
              format={fmt}
              counter
              cents
            />,
          ),
        ),
      );
      await scenario("mount-24", version, 8, (root, kit, i) =>
        flushSync(() =>
          root.render(
            <div>
              {Array.from({ length: 24 }, (_, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length synthetic list, order never changes across renders.
                <kit.Num key={k} value={1000 + k * 97 + i} />
              ))}
            </div>,
          ),
        ),
      );
    }
  }

  const results: Record<string, string> = {};
  const lines: string[] = [];
  for (const name of SCENARIOS) {
    const b = median(samples[`${name}/baseline`] ?? []);
    const c = median(samples[`${name}/current`] ?? []);
    const pct = 100 * (1 - c / b);
    const verdict = pct >= 0 ? "faster" : "slower";
    const line = `${name}: baseline ${b.toFixed(2)}ms -> current ${c.toFixed(2)}ms (${Math.abs(pct).toFixed(0)}% ${verdict})`;
    results[name] = line;
    lines.push(line);
  }

  window.__abResults = results;
  window.__benchDone = true;
  const pre = document.getElementById("results");
  if (pre) pre.textContent = lines.join("\n");
}

setTimeout(() => {
  run().catch((e: unknown) => {
    const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
    window.__benchError = message;
    window.__benchDone = true;
    const pre = document.getElementById("results");
    if (pre) pre.textContent = `ERROR: ${message}`;
  });
}, 100);
