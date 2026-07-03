#!/usr/bin/env bun
/**
 * bench/run.ts — A/B performance benchmark: git BASELINE vs CURRENT
 * working-tree src/, interleaved in one page load.
 *
 * What it does:
 *   1. Copies the working tree src/ to bench/.work/current/src.
 *   2. Extracts src/ as of --ref (default HEAD) via `git show` to
 *      bench/.work/baseline/src.
 *   3. Bundles bench/entry.tsx (which imports both copies) with Bun.build
 *      to bench/.work/entry.js.
 *   4. Verifies the bundle contains exactly one React copy — a second copy
 *      (e.g. from a nested node_modules) silently breaks the library's
 *      useLayoutEffect build, so the benchmark would only measure vdom
 *      diffing (~1.5ms) instead of the real DOM build (~25ms).
 *   5. Serves bench/ over HTTP with Bun.serve and prints the URL. Runs
 *      until Ctrl-C.
 *
 * Usage:
 *   bun run bench/run.ts [--ref <git-ref>] [--port <n>] [--verbose|-v] [--dryrun]
 *
 * Flags:
 *   --ref <git-ref>   Git ref to use as the baseline (default: HEAD).
 *   --port <n>        Port to serve on (default: 8734).
 *   --verbose, -v     Print step-level progress to stderr. Silent otherwise.
 *   --dryrun          Do all preparation and bundling, print what would be
 *                      served, but do not start the server.
 */
import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BENCH = join(ROOT, "bench");
const WORK = join(BENCH, ".work");
const BASELINE_SRC = join(WORK, "baseline", "src");
const CURRENT_SRC = join(WORK, "current", "src");
const BUNDLE_OUT = join(WORK, "entry.js");

function parseArgs(argv: string[]): {
  ref: string;
  port: number;
  verbose: boolean;
  dryrun: boolean;
} {
  let ref = "HEAD";
  let port = 8734;
  let verbose = false;
  let dryrun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ref") {
      const value = argv[++i];
      if (!value) throw new Error("--ref requires a value");
      ref = value;
    } else if (arg === "--port") {
      const value = argv[++i];
      if (!value) throw new Error("--port requires a value");
      port = Number.parseInt(value, 10);
      if (!Number.isFinite(port)) throw new Error(`invalid --port: ${value}`);
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--dryrun") {
      dryrun = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { ref, port, verbose, dryrun };
}

function log(verbose: boolean, message: string): void {
  if (verbose) console.error(`[bench] ${message}`);
}

async function run(): Promise<void> {
  const { ref, port, verbose, dryrun } = parseArgs(process.argv.slice(2));

  log(verbose, `resetting ${WORK}`);
  rmSync(WORK, { recursive: true, force: true });
  await mkdir(BASELINE_SRC, { recursive: true });
  await mkdir(CURRENT_SRC, { recursive: true });

  // (a) copy the working tree src/ to bench/.work/current/src
  log(verbose, `copying working tree src/ -> ${CURRENT_SRC}`);
  await Bun.$`cp -R ${join(ROOT, "src")}/. ${CURRENT_SRC}/`.quiet();

  // (b) extract baseline src/ from git ref
  log(verbose, `listing src/ files at ref ${ref}`);
  const lsTree = await Bun.$`git ls-tree -r --name-only ${ref} -- src/`
    .cwd(ROOT)
    .text();
  const files = lsTree
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (files.length === 0) {
    throw new Error(`no files found under src/ at ref ${ref}`);
  }
  for (const file of files) {
    const rel = file.slice("src/".length);
    const destPath = join(BASELINE_SRC, rel);
    log(verbose, `extracting ${file} @ ${ref} -> ${destPath}`);
    const content = await Bun.$`git show ${ref}:${file}`.cwd(ROOT).text();
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, content);
  }

  // (c) bundle bench/entry.tsx
  log(verbose, "bundling bench/entry.tsx with Bun.build");
  const result = await Bun.build({
    entrypoints: [join(BENCH, "entry.tsx")],
    outdir: WORK,
    naming: "entry.js",
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success) {
    for (const message of result.logs) console.error(message);
    throw new Error("Bun.build failed — see logs above");
  }

  // (d) verify the single-React invariant
  log(verbose, `verifying single React copy in ${BUNDLE_OUT}`);
  const bundleText = await readFile(BUNDLE_OUT, "utf8");
  const reactCopies = countReactCopies(bundleText);
  log(verbose, `detected ${reactCopies} React copy marker(s)`);
  if (reactCopies !== 1) {
    throw new Error(
      `expected exactly 1 React copy in the bundle, found ${reactCopies}. ` +
        "This usually means 'react' or 'react-dom' resolved to two different " +
        "node_modules trees (e.g. a nested one under bench/) — the library's " +
        "useLayoutEffect build would silently never run, and the benchmark " +
        "would only measure vdom overhead, not real DOM cost.",
    );
  }

  // Cache-bust the bundle URL with the file's mtime.
  const stat = await Bun.file(BUNDLE_OUT).stat();
  const version = Math.floor(stat.mtimeMs);
  const htmlTemplate = await readFile(join(BENCH, "index.html"), "utf8");
  const html = htmlTemplate.replace(
    './.work/entry.js"',
    `./.work/entry.js?v=${version}"`,
  );

  if (dryrun) {
    log(verbose, "dryrun: skipping server start");
    console.log(
      `[bench] dryrun complete. Would serve ${BENCH} on http://localhost:${port}/ ` +
        `(bundle ${BUNDLE_OUT}, cache-bust v=${version}).`,
    );
    return;
  }

  log(verbose, `starting server on port ${port}`);
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      if (pathname === "/" || pathname === "/index.html") {
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      const filePath = join(BENCH, pathname);
      if (!filePath.startsWith(BENCH)) {
        return new Response("forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("not found", { status: 404 });
      }
      return new Response(file);
    },
  });

  console.log(`[bench] serving http://localhost:${server.port}/`);
  console.log(`[bench] baseline ref: ${ref}`);
  console.log("[bench] press Ctrl-C to stop");

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      server.stop();
      resolve();
    });
  });
}

function countReactCopies(bundleText: string): number {
  // Each bundled copy of react's CJS dev build embeds this exact path once
  // (in a require/module-id comment); if "react" resolves to two different
  // node_modules trees, Bun.build inlines it twice.
  const marker = "react.development.js";
  let count = 0;
  let index = bundleText.indexOf(marker);
  while (index !== -1) {
    count++;
    index = bundleText.indexOf(marker, index + marker.length);
  }
  return count;
}

if (!existsSync(join(ROOT, "src"))) {
  throw new Error(`expected src/ under repo root ${ROOT}`);
}

await run();
