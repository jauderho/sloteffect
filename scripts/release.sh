#!/usr/bin/env bash
#
# release.sh — cut a synchronized release.
#
# Bumps package.json and creates the matching vX.Y.Z git tag in one commit (so
# the version and tag can never drift), after syncing the lockfile and running
# the full check suite. The actual npm publish happens in CI (publish.yml) when
# the GitHub Release is created — via OIDC Trusted Publishing, no token.
#
# Usage:
#   scripts/release.sh <patch|minor|major|X.Y.Z>
#
# Bun-only; npm is never invoked locally.
set -euo pipefail

bump="${1:-}"
if [[ -z "$bump" ]]; then
  echo "usage: scripts/release.sh <patch|minor|major|X.Y.Z>" >&2
  exit 2
fi

# Start from a clean, up-to-date main.
git switch main
git pull --ff-only

# Install dependencies first — the showcase build and the checks below need them.
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

# bun pm version bumps package.json AND creates the matching vX.Y.Z commit + tag.
bun pm version "$bump" -m "Release v%s"
ver="v$(bun pm pkg get version | tr -d '"')"

git push --follow-tags
gh release create "$ver" --title "$ver" --generate-notes --verify-tag

echo "Released $ver — publish.yml will build and publish to npm via OIDC."
