#!/usr/bin/env bash
#
# release.sh — cut a synchronized release (version bump + tag + GitHub Release).
#
# Bumps package.json and creates the matching vX.Y.Z git tag in one commit (so
# the version and tag can never drift), after syncing the lockfile and running
# the full check suite. The actual npm publish happens in CI (publish.yml) when
# the GitHub Release is created — via OIDC Trusted Publishing, no token.
#
# Nothing irreversible happens until you confirm: the version bump is validated,
# preconditions are checked, and the resolved version is shown for a y/N prompt
# before any branch switch, commit, tag, push, or release. Pass an invalid or
# unrecognized argument and the script exits without touching anything.
#
# Usage:
#   scripts/release.sh <patch|minor|major|X.Y.Z> [options]
#
# Options:
#   -n, --dry-run   Resolve the version and print the plan; make no changes.
#   -y, --yes       Skip the confirmation prompt (required for non-interactive
#                   use, e.g. CI). Without it, a non-TTY run refuses to proceed.
#   -h, --help      Show this help and exit.
#
# Bun-only; npm is never invoked locally.
set -euo pipefail

readonly SELF="scripts/release.sh"

usage() {
  # The header comment block (from line 3 to the first non-comment line), with
  # the leading "# " stripped — so the help text can never drift from the docs.
  awk 'NR>2 { if ($0 !~ /^#/) exit; sub(/^#[[:space:]]?/, ""); print }' "${BASH_SOURCE[0]}"
}

die() {
  echo "$SELF: $1" >&2
  exit "${2:-1}"
}

# ---------------------------------------------------------------------------
# Argument parsing. A bare, strict parser is the primary guardrail: only an
# explicit bump keyword or X.Y.Z is accepted, and any flag (including --help)
# is handled here — never mistaken for a version and never reaching a mutation.
# ---------------------------------------------------------------------------
dry_run=false
assume_yes=false
bump=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    -n | --dry-run)
      dry_run=true
      shift
      ;;
    -y | --yes)
      assume_yes=true
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      die "unknown option: '$1' (try '$SELF --help')" 2
      ;;
    *)
      [[ -z "$bump" ]] || die "unexpected extra argument: '$1'" 2
      bump="$1"
      shift
      ;;
  esac
done
# Any remaining args after `--` are also unexpected.
[[ $# -eq 0 ]] || die "unexpected extra argument: '$1'" 2

[[ -n "$bump" ]] || die "missing version bump (patch|minor|major|X.Y.Z) — try '$SELF --help'" 2

if [[ ! "$bump" =~ ^(patch|minor|major|[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  die "invalid version bump: '$bump' (expected patch, minor, major, or X.Y.Z)" 2
fi

# ---------------------------------------------------------------------------
# Preconditions. Read-only. On a real run a failure aborts; under --dry-run it
# is reported as a warning so the plan still prints (dry-run must never exit
# just because the tree happens to be dirty right now).
# ---------------------------------------------------------------------------
precheck_fail() {
  if [[ "$dry_run" == true ]]; then
    echo "$SELF: [dry-run] would abort: $1" >&2
  else
    die "$1"
  fi
}

# Hard requirements even for a dry-run — without these we cannot reason at all.
for tool in git bun gh; do
  command -v "$tool" >/dev/null 2>&1 || die "required tool not found on PATH: $tool"
done
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

# Authenticated gh is needed for the final Release step. Check it up front so we
# never push a tag we then can't turn into a Release (a messy half-released state).
gh auth status >/dev/null 2>&1 ||
  precheck_fail "gh is not authenticated (run 'gh auth login')"

# A dirty tree is how accidental / half-baked releases happen — the only diffs
# this script should ever commit are the index.html/bun.lock it regenerates.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short >&2
  precheck_fail "working tree has uncommitted changes — commit or stash first"
fi

# Resolve the version main would release from, without switching branches (so a
# dry-run stays side-effect free even when run from a feature branch).
if git rev-parse --verify --quiet main >/dev/null; then
  pkg_json="$(git show main:package.json)"
else
  precheck_fail "no local 'main' branch to release from"
  pkg_json="$(cat package.json)"
fi
cur="$(printf '%s' "$pkg_json" |
  grep -m1 '"version"' |
  sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
[[ -n "$cur" ]] || die "could not read current version from package.json"

resolve_version() {
  local cur="$1" bump="$2" major minor patch
  if [[ "$bump" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s' "$bump"
    return
  fi
  IFS=. read -r major minor patch <<<"$cur"
  case "$bump" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    patch) patch=$((patch + 1)) ;;
  esac
  printf '%s.%s.%s' "$major" "$minor" "$patch"
}

ver="$(resolve_version "$cur" "$bump")"
tag="v$ver"

# The new version must be a strict increase, and its tag must not already exist
# (locally or on origin) — both classic ways a re-run double-releases.
if [[ "$ver" == "$cur" ]]; then
  precheck_fail "resolved version $ver equals the current version — nothing to release"
elif [[ "$(printf '%s\n%s\n' "$cur" "$ver" | sort -V | tail -1)" != "$ver" ]]; then
  precheck_fail "resolved version $ver is not greater than current $cur"
fi
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
  precheck_fail "tag $tag already exists locally"
fi
if git ls-remote --exit-code --tags origin "$tag" >/dev/null 2>&1; then
  precheck_fail "tag $tag already exists on origin"
fi

# ---------------------------------------------------------------------------
# Plan + confirmation. Everything below the confirmation mutates state.
# ---------------------------------------------------------------------------
cat >&2 <<EOF

Release plan:
  current version : $cur
  new version     : $ver   (bump: $bump)
  tag             : $tag
  release branch  : main   (currently on '$(git branch --show-current || echo detached)')
  steps           : switch main → pull --ff-only → build:index → sync bun.lock →
                    typecheck / lint / test / build → bump + tag → push → gh release
  npm publish     : CI (publish.yml) via OIDC, after the GitHub Release is created
EOF

if [[ "$dry_run" == true ]]; then
  echo "" >&2
  echo "$SELF: dry-run — no changes made." >&2
  exit 0
fi

if [[ "$assume_yes" != true ]]; then
  if [[ ! -t 0 ]]; then
    die "refusing to release non-interactively without --yes"
  fi
  printf '\nProceed with release %s? [y/N] ' "$tag" >&2
  read -r reply
  case "$reply" in
    y | Y | yes | YES) ;;
    *) die "aborted by user" 1 ;;
  esac
fi

# ---------------------------------------------------------------------------
# Execute. Ordered so nothing is pushed until the checks pass: a failed check
# leaves at most local chore commits on main (recoverable), never a bad tag.
# ---------------------------------------------------------------------------
git switch main
git pull --ff-only

# Dependencies first — the showcase build and the checks below need them.
bun install

# Regenerate the showcase (index.html) from src/ so the published demo can never
# drift from the package; commit it if it changed.
bun run build:index
if ! git diff --quiet -- index.html; then
  git add index.html
  git commit -S -s -m "chore: rebuild showcase index.html"
fi

# Keep bun.lock in sync with package.json before tagging; commit if it drifted.
if ! git diff --quiet -- bun.lock; then
  git add bun.lock
  git commit -S -s -m "chore: sync bun.lock"
fi

# Fail before tagging if anything is broken.
bun run typecheck
bun run lint
bun run test
bun run build

# Bump to the exact resolved version (not the keyword) so the created tag is
# guaranteed to match what was confirmed above. Creates the vX.Y.Z commit + tag.
bun pm version "$ver" -m "Release v%s"

# Belt and braces: the tag we push must match the confirmed version.
actual="v$(bun pm pkg get version | tr -d '"')"
[[ "$actual" == "$tag" ]] || die "version mismatch after bump ($actual != $tag) — not pushing"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1 || die "tag $tag was not created — not pushing"

git push --follow-tags
gh release create "$tag" --title "$tag" --generate-notes --verify-tag

echo "Released $tag — publish.yml will build and publish to npm via OIDC." >&2
