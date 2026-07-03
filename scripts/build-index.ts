/**
 * build-index.ts — regenerate the showcase (index.html) from src/.
 *
 * index.html is a single static page: it embeds a dependency-free port of the
 * library plus the demo app as plain, pre-compiled JS — no in-browser compiler,
 * so the page loads without Babel-standalone's multi-megabyte download and
 * main-thread compile. The port is *generated* from src/ so it can never drift
 * from the published package — each source module is transpiled (types
 * stripped, JSX compiled to React.createElement against the page's UMD React)
 * and its import/export lines removed, then the modules are concatenated in
 * dependency order, followed by the demo app (scripts/showcase.jsx), and
 * spliced into index.html between the two GENERATED markers.
 *
 * Usage:
 *   bun run build:index            rewrite index.html in place
 *   bun run build:index --check    verify it is up to date; exit 1 if not (CI)
 *   bun run build:index --dryrun   print the would-be file to stdout, write nothing
 *   bun run build:index --verbose  emit step-level progress to stderr
 *
 * Flags may be combined (e.g. --check --verbose). --dryrun implies no write.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const INDEX = join(ROOT, "index.html");

// Source modules inlined into the showcase, in dependency order (reel defines
// the primitives; the components build on it and on each other). index.ts (the
// package's barrel of re-exports) is intentionally excluded.
const MODULES = ["reel.ts", "SlotText.tsx", "SlotLetter.tsx", "SlotNumber.tsx"];

// The hand-written demo app (controls, cards, i18n) appended after the modules.
const SHOWCASE = join(ROOT, "scripts", "showcase.jsx");

// The generated block lives between these markers; everything outside them
// (the HTML shell and the React <script> tags) is hand-written.
const BEGIN =
  "// === BEGIN GENERATED: sloteffect inline port — from src/ via `bun run build:index`; do not edit ===";
const END = "// === END GENERATED ===";

// The <script> body is indented six spaces in index.html; match it so the
// generated block reads naturally in context.
const INDENT = "      ";

const args = new Set(process.argv.slice(2));
const verbose = args.has("--verbose") || args.has("-v");
const check = args.has("--check");
const dryrun = args.has("--dryrun");

const log = (msg: string) => {
  if (verbose) process.stderr.write(`${msg}\n`);
};

/** Transpile one source module: strip types, compile JSX, keep comments. */
function transpile(source: string, fileName: string): string {
  const out = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
      newLine: ts.NewLineKind.LineFeed,
    },
  });
  return out.outputText;
}

/**
 * Drop module syntax: the modules share one scope in the showcase, so every
 * `import` (React hooks come from the global preamble; cross-module symbols are
 * defined inline) and every `export` keyword is removed.
 */
function stripModuleSyntax(code: string): string {
  return code
    .replace(/^import\b[\s\S]*?;[ \t]*$/gm, "") // import … ; (incl. multiline)
    .replace(/^export\s*\{\s*\};?[ \t]*$/gm, "") // empty `export {};` emit
    .replace(/^export\s+/gm, ""); // export const/function/…
}

/** Build the generated body from all source modules. */
function buildBody(): string {
  const sources = [
    ...MODULES.map((file) => ({ file, path: join(SRC, file) })),
    { file: "showcase.jsx", path: SHOWCASE },
  ];
  const parts = sources.map(({ file, path }) => {
    const source = readFileSync(path, "utf8");
    log(`  transpiling ${file}`);
    const stripped = stripModuleSyntax(transpile(source, file)).trim();
    return `// ---- ${file} ${"-".repeat(Math.max(0, 66 - file.length))}\n${stripped}`;
  });
  // One blank line between modules; collapse any runs of blank lines left by
  // removed imports so the output stays tidy.
  const body = parts.join("\n\n").replace(/\n{3,}/g, "\n\n");
  // Indent every non-empty line to sit inside the <script> block.
  return body
    .split("\n")
    .map((line) => (line.length ? INDENT + line : line))
    .join("\n");
}

/** Splice a freshly built body between the markers in `html`. */
function render(html: string): string {
  const begin = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `index.html is missing the GENERATED markers.\n  expected: ${BEGIN}\n        and ${END}`,
    );
  }
  const before = html.slice(0, begin + BEGIN.length);
  const after = html.slice(end);
  return `${before}\n${buildBody()}\n${INDENT}${after}`;
}

const html = readFileSync(INDEX, "utf8");
const next = render(html);

if (dryrun) {
  process.stdout.write(next);
  log("dryrun: nothing written");
} else if (check) {
  if (next !== html) {
    process.stderr.write(
      "index.html is out of date — run `bun run build:index`.\n",
    );
    process.exit(1);
  }
  log("index.html is up to date");
} else if (next !== html) {
  writeFileSync(INDEX, next);
  log(`wrote ${INDEX}`);
  process.stdout.write("index.html regenerated from src/.\n");
} else {
  process.stdout.write("index.html already up to date.\n");
}
