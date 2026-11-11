#!/bin/bash
# Builds site-x: dead-redux's world and maps at a commit (main at eaf2181c by default), read from git (not a worktree's files), and page.html
# (the fixed day's world data, the test hooks on). Its main.js also puts the renderer, scene, camera and the figures on window.__x, so
# the measure can draw the rig alone. Measure-only; never shipped.
set -e
K=$(dirname "$(readlink -f "$0")"); W=${REPO:?set REPO to a dead-redux checkout}
# usage: make_site.sh [<commit> [<site-dir>]] (default: main at eaf2181c, into site-x)
REV=${1:-eaf2181cf5892058abe87dbaf0bbc6f1e058ca54}
d=${2:-$K/site-x}; rm -rf "$d"; mkdir -p "$d"
git -C "$W" archive "$REV" public/world public/maps | tar -x -C "$d" --strip-components=1
cp "$K/page.html" "$d/"
python3 -I - "$d/world/main.js" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
anchor = "  /* The page reads the tier beside the world's state. */"
assert s.count(anchor) == 1
s = s.replace(anchor, "  window.__x = { renderer, scene, camera, crowd, avatar, bears, stage };\n" + anchor)
open(p, "w").write(s)
PY
echo "built $d from $REV"
