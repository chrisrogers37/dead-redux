"""usage: analyse2.py <plan.json> <before-row-dir>... -- <after-row-dir>

Each of the plan's 48 rows before (main at eaf2181c: the first render's rows, then the second's) and after (the fix's head): the most
transitions in any one-second window from 1 s before the peak to the first window after the release, per grey; that split into the
windows that end at or before the peak (the build-up's last second), those holding a frame of the release, and the first one after it.
Writes compare.json beside the after rows and prints the tables.
"""

import json
import os
import sys

args = sys.argv[1:]
cut = args.index("--")
plan = json.load(open(args[0]))["rows"]
before_dirs, after_dir = args[1:cut], args[cut + 1]
FPS = 30


def read(dirs, name):
    for d in dirs:
        p = os.path.join(d, name, "counts.json")
        if os.path.exists(p):
            return json.load(open(p))
    return None


def summary(c):
    if c is None:
        return None
    rel0, rel1 = c["release"]
    last = c["frames"][1]
    out = {}
    for g, v in c["greys"].items():
        line = v["line"]
        before = max([m for f, m, _ in line if f <= 0] or [0])
        release = max([m for f, m, _ in line if rel0 <= f <= rel1 + FPS - 1] or [0])
        after = max([m for f, m, _ in line if f >= rel1 + FPS] or [0])
        out[g] = {"all": max(before, release, after), "before": before, "release": release, "after": after}
    return {"release_s": [round(rel0 / FPS, 3), round(rel1 / FPS, 3)], "last_s": round(last / FPS, 3), "greys": out}


rows = []
for r in plan:
    b, a = summary(read(before_dirs, r["name"])), summary(read([after_dir], r["name"]))
    rows.append({"name": r["name"], "bpm": r["bpm"], "kind": r["kind"], "phase": r["phase"], "before": b, "after": a})
json.dump(rows, open(os.path.join(os.path.dirname(after_dir.rstrip("/")), "compare.json"), "w"), indent=1)

top = lambda s, key="all": max(v[key] for v in s["greys"].values()) if s else None
print(f"{'row':18} {'before':>6} {'after':>6}   after split (build-up's last second / release / first window after)")
for r in rows:
    a = r["after"]
    split = f"{top(a, 'before')}/{top(a, 'release')}/{top(a, 'after')}" if a else "-"
    print(f"{r['name']:18} {str(top(r['before'])):>6} {str(top(a)):>6}   {split}")
for bpm in (159, 140, 120):
    mine = [r for r in rows if r["bpm"] == bpm]
    for side in ("before", "after"):
        have = [r[side] for r in mine if r[side]]
        if not have:
            continue
        per_grey = {g: max(s["greys"][g]["all"] for s in have) for g in have[0]["greys"]}
        print(f"{bpm} {side}: {len(have)} rows, most {max(per_grey.values())}; per grey {per_grey}")
