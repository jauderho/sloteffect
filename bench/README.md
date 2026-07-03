# bench — A/B performance benchmark

Compares a git baseline of `src/` against the current working tree, in one
page load, so perf changes to the library can be checked before merging.

## Run it

```bash
bun run bench
```

This copies the working tree `src/` and extracts a baseline `src/` (default
`HEAD`) into `bench/.work/`, bundles `bench/entry.tsx` (which imports both
copies) with `Bun.build`, verifies exactly one React copy landed in the
bundle, and serves `bench/` over HTTP. Open the printed URL; results appear
in the page within a couple seconds and are also on `window.__abResults`.

Flags:

```bash
bun run bench/run.ts --ref <git-ref>   # baseline ref (default: HEAD)
bun run bench/run.ts --port <n>        # port (default: 8734)
bun run bench/run.ts --verbose         # step-level progress on stderr
bun run bench/run.ts --dryrun          # prepare + bundle, don't serve
```

Compare against an older tag/commit instead of `HEAD`, e.g.:

```bash
bun run bench/run.ts --ref v1.2.0
```

Stop the server with Ctrl-C.

## Scenarios

Each round runs baseline then current for every scenario, over 4 rounds,
interleaved within the single page load (separate page loads showed ±50%
run-to-run variance in practice — not reliable enough to trust a single
number). Per-scenario **medians** across rounds are reported:

- **long-text** — mount a long mixed Latin+digits `SlotText` string, repeated
  with a changing suffix.
- **cjk-text** — mount a CJK `SlotText` string (different reel/segmenter
  path than Latin).
- **counter-churn** — a single `SlotNumber` in odometer (`counter`) + `cents`
  mode, driven through many sequential values (currency counter churn).
- **mount-24** — 24 `SlotNumber` instances mounted/re-rendered together in
  one commit (fan-out cost).

## Reading results

The page prints one line per scenario:

```
long-text: baseline 24.31ms -> current 18.02ms (26% faster)
```

`window.__abResults` holds the same data as `{ [scenario]: line }`;
`window.__benchDone` flips to `true` when finished; `window.__benchError`
is set (and `__benchDone` also flips true) if the run threw.

Absolute numbers vary by machine, browser, and background load — **only the
baseline-vs-current delta on the same run matters.** Treat a **>10% median
slowdown on any scenario** as a regression worth investigating before
merging. Re-run a couple of times if a result is borderline; page-level
noise (GC, JIT warmup) can still nudge single runs.

## Why it's built this way

- **Single React copy required.** Both `src` copies live under
  `bench/.work/{baseline,current}/src`, inside the repo root, so every
  `react`/`react-dom` import in both copies resolves to this repo's
  `node_modules`. If two copies of React ever end up in the bundle (e.g. a
  nested `node_modules`), the library's `useLayoutEffect`-driven DOM build
  silently never runs and the benchmark measures ~1.5ms of vdom diffing
  instead of the real ~25ms DOM build. `bench/run.ts` counts React copies in
  the built bundle after every build and throws if it isn't exactly 1.
- **Interleaved, not sequential page loads.** Alternating baseline/current
  within one page load and taking medians over multiple rounds controls for
  page-level state, GC pauses, and JIT warmup that make separate page loads
  noisy.
- **Microtask tick after each render.** The library defers its DOM build to
  a `queueMicrotask` flush (`scheduleBuild` in `src/SlotText.tsx`). Each
  measured iteration is `flushSync(render)` followed by `await` on a
  microtask tick, so that deferred flush lands inside the measured window.
- **No `requestAnimationFrame`, no long `setTimeout`.** The harness starts
  via a single short `setTimeout(..., 100)` and uses only microtask ticks
  between iterations — rAF never fires in a backgrounded tab, and timers
  above ~100ms get throttled there too, either of which would hang the
  benchmark if depended on.
- **Cache-busted bundle URL.** `bench/run.ts` appends `?v=<bundle mtime>` to
  the script URL so a stale cached bundle is never served after a rebuild.
