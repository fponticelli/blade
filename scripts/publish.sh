#!/bin/bash
set -e

# Always operate from the repo root, regardless of the caller's cwd. Every path
# below is repo-root-relative.
cd "$(dirname "$0")/.."

# Publish the @bladets packages to npm in dependency order.
#
# Publishing is deliberately a LOCAL, DELIBERATE act. CI versions (changesets
# opens a "release: version packages" PR and writes the changelogs) but never
# publishes: a push to main must not be able to ship a package to a registry
# where a version number can never be reused.
#
# Uses `pnpm publish`, which rewrites `workspace:*` / `workspace:^` dependency
# specs to the resolved version in the published tarball, so sources keep
# `workspace:*` and local installs keep working.
#
# Authentication is delegated to whatever pnpm/npm already has configured (a
# token in ~/.npmrc, or a prior `pnpm login`). If missing, this logs in
# interactively rather than failing at the ninth tarball.
#
# Usage:
#   ./scripts/publish.sh                 # publish every publishable package
#   ./scripts/publish.sh blade-tempo     # publish specific package directories
#   DRY_RUN=1 ./scripts/publish.sh       # pack and report, upload nothing

# The publish list is DERIVED, not hand-maintained: scripts/publish-order.mjs
# reads every packages/*/package.json, drops `"private": true` and anything in
# `.changeset/config.json`'s `ignore` (blade-templates ships to the VS Code
# Marketplace, not npm), and topologically sorts the rest so a package's in-repo
# runtime dependencies publish before it does. This repo previously carried two
# hand-rolled publish scripts covering different subsets; a derived list cannot
# have that class of bug.
ORDER_TSV="$(node scripts/publish-order.mjs)" || {
  echo "✗ failed to compute publish order (scripts/publish-order.mjs)"
  exit 1
}

# macOS ships bash 3.2, which has no associative arrays. Look name/deps up from
# the TSV on demand so this runs on the stock system bash.
ALL_DIRS=()
while IFS=$'\t' read -r dir _name _deps; do
  [ -z "$dir" ] && continue
  ALL_DIRS+=("$dir")
done <<< "$ORDER_TSV"

pkg_name() { printf '%s\n' "$ORDER_TSV" | awk -F'\t' -v d="$1" '$1==d {print $2; exit}'; }
pkg_deps() { printf '%s\n' "$ORDER_TSV" | awk -F'\t' -v d="$1" '$1==d {print $3; exit}'; }

# Completeness assertion: every package that SHOULD go to npm must appear in the
# derived list. Guards against one being invisibly dropped, e.g. by a dependency
# cycle that makes the topological sort bail.
IGNORED=$(node -e "const c=require('./.changeset/config.json');process.stdout.write((c.ignore||[]).join(' '))")
EXPECTED=0
for d in packages/*/; do
  [ -f "${d}package.json" ] || continue
  skip=$(node -e "
    const p = require('./${d}package.json');
    const ignored = ' ${IGNORED} '.includes(' ' + p.name + ' ');
    process.stdout.write(String(!!p.private || ignored));
  ")
  [ "$skip" = "true" ] && continue
  EXPECTED=$((EXPECTED + 1))
done
if [ "${#ALL_DIRS[@]}" -ne "$EXPECTED" ]; then
  echo "✗ publish coverage mismatch: derived ${#ALL_DIRS[@]} packages but $EXPECTED should publish."
  echo "  Check scripts/publish-order.mjs for a cycle or omission."
  exit 1
fi

# If args were given, publish only those directories - but keep topological
# order and the failure-cascade semantics below.
if [ $# -gt 0 ]; then
  REQUESTED=" $* "
  PKGS=()
  for dir in "${ALL_DIRS[@]}"; do
    case "$REQUESTED" in
      *" $dir "*) PKGS+=("$dir") ;;
    esac
  done
  if [ ${#PKGS[@]} -eq 0 ]; then
    echo "✗ none of '$*' is a publishable package directory."
    echo "  Publishable: ${ALL_DIRS[*]}"
    exit 1
  fi
else
  PKGS=("${ALL_DIRS[@]}")
fi

# Nothing ships that has not passed the same gate CI runs. A published version
# number can never be reused, so this runs BEFORE the first upload, not per
# package - a green package 1 followed by a red package 2 is the partial release
# the cascade below exists to contain.
echo "Running the full gate before publishing anything..."
# NOTE the subshell: `if ! a && b` negates only `a`, so the rest of the chain
# would run un-negated and a failure in it would NOT be caught here.
if ! (pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test && pnpm build && pnpm check:bundles && pnpm check:api); then
  echo "✗ gate failed - nothing published."
  exit 1
fi
echo "✓ gate passed"
echo ""

# Warn on a dirty tree: the tarball is built from the working directory, so
# uncommitted work would ship silently.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "⚠ working tree has uncommitted changes - they WILL be included in the tarballs:"
  git status --short --untracked-files=no | sed 's/^/    /'
  echo ""
fi

# Preflight auth: npm returns 404 on PUT for unauthenticated writers rather than
# 403 (to avoid leaking scope existence), so a stale token surfaces as a
# confusing "package not found". Catch it here with a whoami probe instead.
check_auth() { pnpm whoami --registry https://registry.npmjs.org/ 2>&1 || true; }

if [ -z "$DRY_RUN" ]; then
  echo "Checking npm auth..."
  WHOAMI_OUTPUT=$(check_auth)

  if echo "$WHOAMI_OUTPUT" | grep -qE 'E401|Unauthorized|ENEEDAUTH'; then
    echo "✗ Not authenticated to npm - token missing, expired, or revoked."
    echo ""
    echo "Starting interactive login..."
    echo ""
    if ! pnpm login --registry https://registry.npmjs.org/; then
      echo ""
      echo "✗ pnpm login failed or was cancelled. Aborting publish."
      exit 1
    fi
    echo ""
    echo "Re-checking auth..."
    WHOAMI_OUTPUT=$(check_auth)
    if echo "$WHOAMI_OUTPUT" | grep -qE 'E401|Unauthorized|ENEEDAUTH'; then
      echo "✗ Still unauthenticated after login. Check ~/.npmrc and try again:"
      echo "  pnpm whoami --registry https://registry.npmjs.org/"
      exit 1
    fi
  fi

  if [ -z "$WHOAMI_OUTPUT" ] || echo "$WHOAMI_OUTPUT" | grep -qiE 'error|fail'; then
    echo "✗ pnpm whoami failed with unexpected output:"
    echo "$WHOAMI_OUTPUT" | sed 's/^/  /'
    echo ""
    echo "Resolve this before retrying - we don't want to start a partial"
    echo "publish against a broken registry connection."
    exit 1
  fi

  echo "✓ Authenticated as $WHOAMI_OUTPUT"
  echo ""
fi

if [ -n "$DRY_RUN" ]; then
  echo "DRY RUN - packing only, nothing will be uploaded."
  echo ""
fi

echo "Publishing ${#PKGS[@]} package(s): ${PKGS[*]}"
echo ""

FAILED=()
SUCCEEDED=()
SKIPPED=()
# Names (not dirs) that failed OR were skipped, so dependents cascade.
# Space-padded for whole-word matching.
FAILED_NAMES=" "

for pkg in "${PKGS[@]}"; do
  dir="packages/$pkg"
  if [ ! -d "$dir" ]; then
    echo "⚠ packages/$pkg not found, skipping"
    continue
  fi

  name="$(pkg_name "$pkg")"
  version=$(node -e "process.stdout.write(require('./$dir/package.json').version)")

  # Idempotency probe: if this exact name@version is already on the registry (a
  # prior run published it before failing further down the list), record it as a
  # success and move on WITHOUT cascading. Re-attempting would make npm reject
  # the duplicate as a hard error, which would then cascade-skip every downstream
  # dependent - turning one mid-list failure into an unrecoverable release.
  #
  # This asks the registry for the VERSION document, not `npm view`. Observed on
  # the 0.7.0 release: minutes after @bladets/lsp-server@0.1.1 published
  # successfully, `npm view` still answered E404 while
  # /-/package/<name>/dist-tags and /<name>/<version> both answered 200 with the
  # real tarball. `npm view` reads the aggregate package document, which is CDN
  # cached and lags a first publish; the per-version document does not. Trusting
  # the lagging read would have re-published a live version (hard failure) and,
  # for a DEPENDENCY, cascade-skipped every dependent for no reason.
  if [ -z "$DRY_RUN" ]; then
    # Percent-encode the scope separator: @scope/name -> @scope%2Fname.
    encoded_name="${name/\//%2F}"
    probe_status="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 \
      "https://registry.npmjs.org/${encoded_name}/${version}" 2>/dev/null || true)"
    if [ "$probe_status" = "200" ]; then
      echo "✓ $name@$version already on registry - skipping (idempotent re-run)."
      SUCCEEDED+=("$name@$version (already published)")
      echo ""
      continue
    fi
  fi

  # Failure cascade: if any transitive in-repo dependency already failed or was
  # skipped, do NOT publish this - it would ship pointing at a dependency version
  # that never reached the registry. Skip it and mark it failed so ITS dependents
  # cascade in turn (topological order guarantees deps are handled first).
  blocked=""
  IFS=',' read -ra deps <<< "$(pkg_deps "$pkg")"
  for dep in "${deps[@]}"; do
    [ -z "$dep" ] && continue
    case "$FAILED_NAMES" in
      *" $dep "*) blocked="$dep"; break ;;
    esac
  done
  if [ -n "$blocked" ]; then
    echo "⏭ Skipping $name - dependency $blocked did not publish."
    SKIPPED+=("$name (needs $blocked)")
    FAILED_NAMES+="$name "
    echo ""
    continue
  fi

  echo "Publishing $name@$version..."

  # Clean dist/ BEFORE building so the tarball never carries stale artifacts: a
  # build never removes the outputs of DELETED sources, and `files: ["dist"]`
  # ships whatever is in dist/. Without this, modules deleted from src/ linger in
  # dist/ and get published forever.
  if node -e "process.exit(require('./$dir/package.json').scripts?.build ? 0 : 1)"; then
    rm -rf "$dir/dist"
    if ! (cd "$dir" && pnpm run build); then
      echo "✗ $name failed to build - aborting its publish."
      FAILED+=("$name (build)")
      FAILED_NAMES+="$name "
      echo ""
      continue
    fi
  fi

  # pnpm publish substitutes workspace:* with the concrete version at pack time,
  # so the tarball carries real semver ranges while sources stay on workspace:*.
  # --no-git-checks skips pnpm's uncommitted-changes guard; the dirty-tree
  # warning above already surfaced that, and the version bump commit is made by
  # the changesets version PR rather than here.
  PUBLISH_ARGS=(--access public --no-git-checks)
  [ -n "$DRY_RUN" ] && PUBLISH_ARGS+=(--dry-run)

  # Belt and braces for the same lag: if the probe above missed and npm rejects
  # the upload *because the version already exists*, that is proof it published,
  # not a failure. Treat it as success so dependents are not cascade-skipped.
  # `set -e` would abort the whole script on a failing command substitution, so
  # the status is captured through `||`, which makes the failure part of a list
  # and therefore not fatal.
  publish_status=0
  publish_output="$( (cd "$dir" && pnpm publish "${PUBLISH_ARGS[@]}") 2>&1 )" || publish_status=$?
  echo "$publish_output"

  if [ $publish_status -eq 0 ]; then
    SUCCEEDED+=("$name@$version")
    echo "✓ $name@$version published"
  elif echo "$publish_output" | grep -qiE "cannot publish over|previously published version"; then
    echo "✓ $name@$version was already on the registry - treating as published."
    SUCCEEDED+=("$name@$version (already published)")
  else
    FAILED+=("$name")
    FAILED_NAMES+="$name "
    echo "✗ $name failed"
  fi
  echo ""
done

echo "=== Results ==="
if [ ${#SUCCEEDED[@]} -gt 0 ]; then
  echo "Published:"
  for s in "${SUCCEEDED[@]}"; do echo "  ✓ $s"; done
fi
if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "Skipped (dependency did not publish):"
  for s in "${SKIPPED[@]}"; do echo "  ⏭ $s"; done
fi
if [ ${#FAILED[@]} -gt 0 ] || [ ${#SKIPPED[@]} -gt 0 ]; then
  if [ ${#FAILED[@]} -gt 0 ]; then
    echo "Failed:"
    for f in "${FAILED[@]}"; do echo "  ✗ $f"; done
  fi
  exit 1
fi
echo "Done."
