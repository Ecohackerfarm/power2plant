#!/usr/bin/env bash
# Release automation for power2plant.
# Called by Claude Code when user triggers a release.
# Usage: ./scripts/release.sh [validate|merge|publish|next]
# Run steps in order; or run all with no arg.

set -euo pipefail

REPO="Ecohackerfarm/power2plant"
STEP="${1:-all}"

# ── helpers ──────────────────────────────────────────────────────────────────

err()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

bump_minor() {
  local v="$1"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$v"
  echo "${major}.$((minor + 1)).0"
}

# ── find lowest open release PR ──────────────────────────────────────────────

find_release_pr() {
  local pr_json
  pr_json=$(gh pr list \
    --repo "$REPO" \
    --base main \
    --state open \
    --json number,title,headRefName \
    --jq 'map(select(.headRefName | startswith("release/"))) | sort_by(.number) | .[0]')

  if [ -z "$pr_json" ] || [ "$pr_json" = "null" ]; then
    err "No open release/* PR targeting main found."
  fi

  echo "$pr_json"
}

# ── validate ─────────────────────────────────────────────────────────────────

do_validate() {
  info "=== VALIDATE ==="

  local pr_json
  pr_json=$(find_release_pr)

  PR_NUMBER=$(echo "$pr_json" | jq -r '.number')
  PR_BRANCH=$(echo "$pr_json" | jq -r '.headRefName')
  PR_TITLE=$(echo "$pr_json"  | jq -r '.title')

  info "PR #$PR_NUMBER: $PR_TITLE ($PR_BRANCH)"

  # extract version from branch name
  VERSION=$(echo "$PR_BRANCH" | grep -oP '(?<=release/v)\d+\.\d+\.\d+' || true)
  if [ -z "$VERSION" ]; then
    err "Branch $PR_BRANCH does not match release/vX.Y.Z"
  fi
  info "Target version: $VERSION"

  # check CI
  info "Checking CI for PR #$PR_NUMBER..."
  CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --repo "$REPO" --json name,state,conclusion 2>/dev/null || true)
  if [ -n "$CHECKS_JSON" ] && [ "$CHECKS_JSON" != "[]" ]; then
    FAILED=$(echo "$CHECKS_JSON" | jq '[.[] | select(.conclusion != null and .conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL")] | length')
    PENDING=$(echo "$CHECKS_JSON" | jq '[.[] | select(.conclusion == null or .conclusion == "")] | length')
    if [ "$FAILED" -gt 0 ]; then
      echo "$CHECKS_JSON" | jq -r '.[] | select(.conclusion != null and .conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL") | "  FAIL: \(.name) (\(.conclusion))"'
      err "CI has $FAILED failing check(s). Fix before releasing."
    fi
    if [ "$PENDING" -gt 0 ]; then
      echo "$CHECKS_JSON" | jq -r '.[] | select(.conclusion == null or .conclusion == "") | "  PENDING: \(.name)"'
      err "CI has $PENDING pending check(s). Wait for completion."
    fi
    info "CI: all checks passed."
  else
    info "CI: no checks found (may not have run yet — proceed with caution)."
  fi

  # check package.json version
  PKG_VERSION=$(jq -r '.version' package.json)
  if [ "$PKG_VERSION" != "$VERSION" ]; then
    echo "VERSION_MISMATCH: package.json=$PKG_VERSION branch=$VERSION"
    echo "NEEDS_FIX: set package.json .version to $VERSION, commit, push"
    exit 2
  fi
  info "package.json version: $PKG_VERSION ✓"

  echo "VALIDATE_OK PR=$PR_NUMBER BRANCH=$PR_BRANCH VERSION=$VERSION"
}

# ── merge ─────────────────────────────────────────────────────────────────────

do_merge() {
  local pr_number="${2:-}"
  if [ -z "$pr_number" ]; then
    local pr_json
    pr_json=$(find_release_pr)
    pr_number=$(echo "$pr_json" | jq -r '.number')
  fi

  info "=== MERGE PR #$pr_number ==="
  gh pr merge "$pr_number" --repo "$REPO" --merge --delete-branch --subject "" 2>/dev/null || \
    gh pr merge "$pr_number" --repo "$REPO" --merge --delete-branch
  info "Merged PR #$pr_number into main."
}

# ── publish github release ────────────────────────────────────────────────────

do_publish() {
  local version="${2:-}"
  if [ -z "$version" ]; then
    err "Usage: $0 publish <version>"
  fi

  info "=== GITHUB RELEASE v$version ==="

  # collect PR bodies since last tag for context (Claude generates notes)
  local last_tag
  last_tag=$(gh release list --repo "$REPO" --limit 1 --json tagName --jq '.[0].tagName')
  info "Last release: $last_tag"
  info "Commits since $last_tag:"
  git log "${last_tag}..HEAD" --oneline --no-decorate 2>/dev/null | head -30 || true
}

# ── create next release branch ────────────────────────────────────────────────

do_next() {
  local current_version="${2:-}"
  if [ -z "$current_version" ]; then
    err "Usage: $0 next <current_version>"
  fi

  local next_version
  next_version=$(bump_minor "$current_version")
  local next_branch="release/v${next_version}"

  info "=== NEXT BRANCH: $next_branch ==="

  git fetch origin main
  git checkout -b "$next_branch" origin/main
  info "Created $next_branch from origin/main"

  # bump package.json version
  jq ".version = \"${next_version}\"" package.json > package.json.tmp
  mv package.json.tmp package.json
  info "Bumped package.json to $next_version"

  echo "NEXT_VERSION=$next_version NEXT_BRANCH=$next_branch"
  echo "READY_TO_COMMIT: package.json updated — commit, push, open draft PR"
}

# ── dispatch ──────────────────────────────────────────────────────────────────

case "$STEP" in
  validate) do_validate ;;
  merge)    do_merge "$@" ;;
  publish)  do_publish "$@" ;;
  next)     do_next "$@" ;;
  all)
    do_validate
    ;;
  *)
    err "Unknown step: $STEP. Use: validate | merge | publish <v> | next <v>"
    ;;
esac
