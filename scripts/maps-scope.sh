#!/usr/bin/env bash
# Checks that the commits a pull request brings from the maps branch only add or change maps.
#
#   bash scripts/maps-scope.sh BASE HEAD MAPS
#
# BASE is the commit the pull request merges into, HEAD its head commit and MAPS the maps branch's ref. A commit comes from maps when
# it is in the history of both HEAD and MAPS and not in BASE's: it is known by where it is, never by its author line, which is free
# text. Each must have one parent, as every commit the Maps workflow makes does, and may only add or modify regular files named
# public/maps/YYYY-MM-DD.json, the maps it writes. A commit with more parents or none, and any other path, a deletion or another kind
# of file, is listed with its commit, and the check fails. It passes when no commit comes from maps, and when there is no maps branch.
#
# CI runs the copy on the pull request's base (the Maps scope job in .github/workflows/ci.yml); scripts/__tests__/maps-scope.test.ts
# runs this one.
set -euo pipefail
export LC_ALL=C

if [ $# -ne 3 ]; then
  echo "Usage: bash scripts/maps-scope.sh BASE HEAD MAPS" >&2
  exit 2
fi
base=$(git rev-parse --verify --quiet "$1^{commit}") || { echo "Not a commit: $1" >&2; exit 2; }
head=$(git rev-parse --verify --quiet "$2^{commit}") || { echo "Not a commit: $2" >&2; exit 2; }
if ! maps=$(git rev-parse --verify --quiet "$3^{commit}"); then
  echo "There is no maps branch at $3, so no commit comes from it."
  exit 0
fi

# What both histories hold is what their merge bases reach. merge-base exits 1 when the two share no commit at all, and then no
# commit comes from maps; any other failure stops the check.
bases=$(git merge-base --all "$head" "$maps" || [ $? -eq 1 ])
commits=""
if [ -n "$bases" ]; then
  # One line a commit, oldest first: the commit, then its parents.
  # shellcheck disable=SC2086 # one commit a word
  commits=$(git rev-list --reverse --parents $bases --not "$base")
fi
if [ -z "$commits" ]; then
  echo "No commit comes from maps."
  exit 0
fi

map='^public/maps/[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$'
count=0
failed=0
fail() {
  if [ "$failed" -eq 0 ]; then
    echo "Commits from maps may only add or change maps (public/maps/YYYY-MM-DD.json), with one parent each. These do not:"
  fi
  failed=1
  echo "  $1"
}
while read -r commit parents; do
  count=$((count + 1))
  # shellcheck disable=SC2086 # one parent a word
  set -- $parents
  if [ $# -ne 1 ]; then
    fail "$commit has $# parents"
    continue
  fi
  # A line for each file the commit changes: the old and new modes, the old and new blobs and the status, then a tab and the path,
  # which git quotes when it holds an unusual character. A map's name holds none.
  changes=$(git diff-tree -r --no-renames --no-commit-id "$commit")
  while IFS=$'\t' read -r change path; do
    [ -n "$change" ] || continue
    read -r _ mode _ _ status <<< "$change"
    if [[ $status =~ ^[AM]$ && $mode == 100644 && $path =~ $map ]]; then
      continue
    fi
    case $status in
      A) what="adds $path" ;;
      M) what="changes $path" ;;
      D) what="deletes $path" ;;
      T) what="changes the type of $path" ;;
      *) what="changes $path ($status)" ;;
    esac
    # A deleted file's new mode is 000000; any other mode but a plain file's is named.
    if [[ $status != D && $mode != 100644 ]]; then
      what="$what, as mode $mode"
    fi
    fail "$commit $what"
  done <<< "$changes"
done <<< "$commits"

if [ "$failed" -ne 0 ]; then
  exit 1
fi
echo "Commits from maps: $count. Each only adds or changes maps."
