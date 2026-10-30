#!/usr/bin/env python3
"""The landmark placement checks of the base and of this branch, run in plain Node against the real three build.

usage: python3 bench.py all | selftest | fixed | pins | sweep ... | timing ... | nearest ... | determinism | planted
Paths come from BENCH_KIT, BENCH_TMP, BENCH_THREE_DIR, BENCH_BASE_WORLD, BENCH_HEAD_WORLD, BENCH_FIXED_DAY and BENCH_OUT.
"""
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time

KIT = os.environ.get("BENCH_KIT", os.path.dirname(os.path.abspath(__file__)))
SP = os.environ["BENCH_TMP"]
NODE = shutil.which("node")
THREE_DIR, THREE_FILE = os.environ["BENCH_THREE_DIR"], "three.module.min.js"
BASE_WORLD, HEAD_WORLD = os.environ["BENCH_BASE_WORLD"], os.environ["BENCH_HEAD_WORLD"]
DRIVER = KIT + "/diff.mjs"
OUT = os.environ["BENCH_OUT"]
NKINDS = 31  # rules in the builders table; kind -1 is the standing stone


def run_node(mode, opts=None, head_world=HEAD_WORLD, max_s=1500):
    """One node run. Returns (objects printed as JSON lines, info)."""
    env = {**os.environ, "TZ": "UTC", "BENCH_THREE_DIR": THREE_DIR, "BENCH_THREE_FILE": THREE_FILE, "BENCH_BASE_WORLD": BASE_WORLD,
           "BENCH_HEAD_WORLD": head_world, "BENCH_KIT": KIT, "BENCH_FIXED_DAY": os.environ["BENCH_FIXED_DAY"], "BENCH_OPTS": json.dumps(opts or {})}
    t0, killed = time.time(), None
    try:
        run = subprocess.run([NODE, "--no-warnings", DRIVER, mode], cwd=KIT, env=env, capture_output=True, text=True, timeout=max_s)
        out, err, rc = run.stdout, run.stderr, run.returncode
    except subprocess.TimeoutExpired as e:
        out, err, rc, killed = (e.stdout or ""), (e.stderr or ""), None, f"over {max_s} s"
        out = out.decode() if isinstance(out, bytes) else out
        err = err.decode() if isinstance(err, bytes) else err
    objs = []
    for line in out.splitlines():
        try:
            objs.append(json.loads(line))
        except ValueError:
            pass
    return objs, {"killed": killed, "seconds": round(time.time() - t0, 2), "rc": rc, "stderr": err.strip()[-600:]}


def args_of(argv):
    a = {"tier": "desktop", "stride": "1", "per": "4", "kinds": None, "tag": "main", "head": HEAD_WORLD, "per-kind": "4"}
    i = 0
    while i < len(argv):
        if argv[i].startswith("--"):
            a[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    return a


def kinds_of(a):
    return [int(x) for x in a["kinds"].split(",")] if a["kinds"] else list(range(-1, NKINDS))


def tiers_of(a):
    return ["desktop", "phone"] if a["tier"] == "both" else [a["tier"]]


def sweep(a, quiet=False):
    stride, per, tag = float(a["stride"]), int(a["per"]), a["tag"]
    path = f"{OUT}/sweep_{tag}.jsonl"
    done = set()
    if os.path.exists(path):
        for line in open(path):
            r = json.loads(line)
            done.add((r["slice"]["tier"], r["slice"]["kind"]))
    for tier in tiers_of(a):
        todo = [k for k in kinds_of(a) if (tier, k) not in done]
        for i in range(0, len(todo), per):
            ks = todo[i:i + per]
            objs, info = run_node("sweep", {"tier": tier, "kinds": ks, "stride": stride, **({"n": int(a["n"])} if a.get("n") else {})}, head_world=a["head"])
            if info["killed"] or info["rc"] != 0 or len(objs) != len(ks):
                print(f"SLICE FAILED tier={tier} kinds={ks}: {info}")
                sys.exit(2)
            with open(path, "a") as f:
                for o in objs:
                    f.write(json.dumps(o) + "\n")
            if not quiet:
                print(f"  {tier} kinds {ks}: {info['seconds']} s", flush=True)
    return path


def fmt(x, n=3):
    return "-" if x is None else (f"{x:.{n}f}" if isinstance(x, float) else str(x))


def summary(path, only_kinds=None):
    rows = [json.loads(line) for line in open(path)]
    tot = {}
    print(f"{'tier':8} {'kind':>4} {'title':30} {'n':>5} {'moved':>5} {'bViol':>5} {'bHit':>5} {'stayV':>5} {'sh25n':>5} {'sh25max':>8} {'sh02max':>8} {'hard':>4} {'maxDisp':>7} {'meanD':>6} {'shape':>5} {'yBad':>4} {'ms/lm b':>8} {'ms/lm h':>8}")
    for r in rows:
        s = r["slice"]
        if only_kinds is not None and s["kind"] not in only_kinds:
            continue
        print(f"{s['tier']:8} {s['kind']:>4} {s['title'][:30]:30} {r['n']:>5} {r['moved']:>5} {r['baseViol']:>5} {r['baseHit']:>5} {r['stayViol']:>5} {r['headShort25']:>5} {r['maxShort25']:>8.4f} {r['maxShort02']:>8.4f} {r['hardHit']:>4} {r['maxDisp']:>7.2f} {r['meanDisp']:>6.2f} {r['shapeBad']:>5} {r['yBad']:>4} {r['msBase'] / r['n']:>8.3f} {r['msHead'] / r['n']:>8.3f}")
        for k in ("n", "moved", "baseViol", "baseHit", "baseInside", "movedButClear", "stayViol", "headShort25", "headShort02", "hardHit", "shapeBad", "yBad", "stillBad", "consistBad"):
            tot[k] = tot.get(k, 0) + r[k]
        tot["maxDisp"] = max(tot.get("maxDisp", 0), r["maxDisp"])
        tot["maxShort25"] = max(tot.get("maxShort25", 0), r["maxShort25"])
        tot["maxShort02"] = max(tot.get("maxShort02", 0), r["maxShort02"])
        tot["minHead02"] = min(tot.get("minHead02", 9e9), r["minHead02"] if r["minHead02"] is not None else 9e9)
    print("TOTAL", json.dumps(tot))
    sel = [r for r in rows if only_kinds is None or r["slice"]["kind"] in only_kinds]
    if sel and "maxRadH" in sel[0]:
        print("WHERE THEY STAND (all kinds, all positions in these rows): island radius max base %.1f head %.1f m | nearest stage centre base %.1f head %.1f m | nearest cave centre base %.1f head %.1f m | lowest ground base %.2f head %.2f m"
              % (max(r["maxRadB"] for r in sel), max(r["maxRadH"] for r in sel), min(r["minStageB"] for r in sel), min(r["minStageH"] for r in sel),
                 min(r["minCaveB"] for r in sel), min(r["minCaveH"] for r in sel), min(r["minBy"] for r in sel), min(r["minHy"] for r in sel)))
    return rows, tot


def cmd_selftest():
    objs, info = run_node("selftest")
    for o in objs:
        print(json.dumps(o))
    print(info)
    geo = [o for o in objs if o.get("phase") == "geometry"]
    planted = [o for o in objs if o.get("phase") == "planted-wrong oracle"]
    diff = [o for o in objs if str(o.get("phase", "")).startswith("differential")]
    ok = bool(geo) and not geo[0]["failed"] and len(planted) == 5 and all(p["caught"] > 0 for p in planted) and bool(diff) and diff[0]["head"]["hullSet"] == 0 and diff[0]["head"]["outside"] == 0
    print("SELFTEST", "PASS" if ok and info["rc"] == 0 else "FAIL")


def cmd_fixed():
    objs, info = run_node("fixed", max_s=9000)
    path = OUT + "/fixed_out.jsonl"
    with open(path, "w") as f:
        for o in objs:
            f.write(json.dumps(o) + "\n")
    print(info)
    for o in objs:
        if "fixed" not in o:
            print(json.dumps(o))
            continue
        x = o["fixed"]
        print(f"\n== tier {x['tier']}: layoutEqual={x['layoutEqual']} sameCount={x['sameCount']} unmovedEqual={x['unmovedEqual']} moved={x['movedCount']} of {len(x['rows'])}; placeLandmarks median ms base {x['msBaseMedian']:.2f} head {x['msHeadMedian']:.2f} (max {x['msBaseMax']:.2f} / {x['msHeadMax']:.2f})")
        print(f"{'i':>2} {'title':32} {'kind':>4} {'moved':>5} {'disp':>6} {'ang':>7} {'dy':>6} {'base25':>7} {'base02':>7} {'head25':>7} {'head02':>7} {'line->ctr':>9} {'shape':>5} {'yRule':>5}")
        for r in x["rows"]:
            print(f"{r['i']:>2} {r['title'][:32]:32} {r['kind']:>4} {str(r['moved']):>5} {r['disp']:>6.2f} {r['ang']:>7.1f} {r['dy']:>6.2f} {r['base25']:>7.3f} {r['base02']:>7.3f} {r['head25']:>7.3f} {r['head02']:>7.3f} {r['lineToCentre']:>9.2f} {str(r['shape']):>5} {str(r['yRule']):>5}")
        for p in x.get("pairs", []):
            flag = "NEW OVERLAP" if p["overlapHead"] and not p["overlapBase"] else ("overlap in both" if p["overlapHead"] else ("closer" if p["gapHead"] < p["gapBase"] else ""))
            print(f"   pair {p['i']:>2}-{p['j']:<2} {p['a'][:22]:22} / {p['b'][:22]:22} gap base {p['gapBase']:.2f} head {p['gapHead']:.2f} {flag}")


def cmd_timing(a):
    path = f"{OUT}/timing_{a['tag']}.jsonl"
    done = set()
    if os.path.exists(path):
        for line in open(path):
            r = json.loads(line)["timing"]
            done.add((r["tier"], r["kind"]))
    per, n = int(a["per"]), int(a.get("n", "40"))
    for tier in tiers_of(a):
        todo = [k for k in kinds_of(a) if (tier, k) not in done]
        for i in range(0, len(todo), per):
            ks = todo[i:i + per]
            objs, info = run_node("timing", {"tier": tier, "kinds": ks, "n": n}, max_s=900)
            if info["killed"] or info["rc"] != 0 or len(objs) != len(ks):
                print(f"TIMING SLICE FAILED tier={tier} kinds={ks}: {info}")
                sys.exit(2)
            with open(path, "a") as f:
                for o in objs:
                    f.write(json.dumps(o) + "\n")
            print(f"  {tier} kinds {ks}: {info['seconds']} s", flush=True)
    rows = [json.loads(line)["timing"] for line in open(path)]
    print(f"\nCPU ms of ONE placeLandmarks call with one landmark (n={n} positions per kind); the build of the landmark is in both columns")
    print(f"{'tier':8} {'kind':>4} {'title':26} {'moved%':>6} {'maxDisp':>7} | {'base p50':>8} {'p95':>7} {'max':>7} | {'head p50':>8} {'p95':>7} {'max':>8}")
    for r in rows:
        b, h = r["base"], r["head"]
        print(f"{r['tier']:8} {r['kind']:>4} {r['title'][:26]:26} {100 * r['movedFraction']:>6.0f} {r['maxDisp']:>7.2f} | {b['p50']:>8.2f} {b['p95']:>7.2f} {b['max']:>7.2f} | {h['p50']:>8.2f} {h['p95']:>7.2f} {h['max']:>8.2f}")


def cmd_pins():
    path = OUT + "/pins.jsonl"
    open(path, "w").close()
    for tier in ("desktop", "phone"):
        objs, info = run_node("pins", {"tier": tier}, max_s=9000)
        if info["killed"] or info["rc"] != 0:
            print(f"PINS FAILED tier={tier}: {info}")
            continue
        with open(path, "a") as f:
            for o in objs:
                f.write(json.dumps(o) + "\n")
        print(f"\n== tier {tier} ({info['seconds']} s): per kind, at each pin: 'disp m (base02 -> head02)' with - for a landmark that stays")
        names = [r["pin"] for r in objs[0]["pins"]["rows"]]
        print(f"{'kind':>4} {'title':26} " + " ".join(f"{n[:22]:>24}" for n in names))
        for o in objs:
            p = o["pins"]
            cells = [("-" if not r["moved"] else f"{r['disp']:.2f}") + f" ({r['base02']:.2f}->{r['head02']:.2f})" for r in p["rows"]]
            print(f"{p['kind']:>4} {p['title'][:26]:26} " + " ".join(f"{c:>24}" for c in cells))


def cmd_nearest(a):
    path = f"{OUT}/nearest_{a['tag']}.jsonl"
    kinds = kinds_of(a)
    for tier in tiers_of(a):
        for k in kinds:
            objs, info = run_node("nearest", {"tier": tier, "kinds": [k], "stride": float(a["stride"]), "perKind": int(a["per-kind"])}, head_world=a["head"], max_s=9000)
            if info["killed"] or info["rc"] != 0:
                print(f"NEAREST FAILED tier={tier} kind={k}: {info}")
                continue
            with open(path, "a") as f:
                for o in objs:
                    f.write(json.dumps(o) + "\n")
            for o in objs:
                n = o["nearest"]
                ov = [r["overshoot"] for r in n["rows"] if r["overshoot"] is not None]
                print(f"  {tier} kind {k:>3} {n['title'][:26]:26} moved placements {n['movedPlacements']:>4}, sampled {n['sampled']}: overshoot " + (f"min {min(ov):.3f} max {max(ov):.3f}" if ov else "n/a"), flush=True)


def cmd_determinism():
    digests = []
    for rep in range(2):
        objs, info = run_node("fixed", max_s=9000)
        d = [o["digest"] for o in objs if "digest" in o]
        s, _ = run_node("sweep", {"tier": "desktop", "kinds": [13, 24], "stride": 3.0})[0], None
        sd = [x["digest"] for x in s]
        digests.append((d, sd))
        print(f"process {rep + 1}: fixed digest {d}, sweep digests {[x[:16] for x in sd]}")
    print("DETERMINISM", "PASS" if digests[0] == digests[1] and digests[0][0] and digests[0][1] else "FAIL")


PLANTED = [  # id, file, old, new, kinds (where the defect should show), note
    ("P1", "path.js", 'spins = moving.some((m) => m.obj === o && m.kind === "spin")', "spins = false", [22], "outline ignores the spin"),
    ("P2", "path.js", "for (let d = 0; d < line.length; d += 0.25)", "for (let d = 0; d < line.length; d += 1)", [13, 24, 28], "the line sampled every metre"),
    ("P3", "path.js", "standClear(p.x, p.z, g.rotation.y, outline(g, moving), pts)", "standClear(p.x, p.z, 0, outline(g, moving), pts)", [15, 16, 28], "the landmark's turn ignored"),
    ("P4", "path.js", "k < 32; k++) pts.push([x + r", "k < 8; k++) pts.push([x + r", [22], "the swept circle as an octagon"),
    ("C1", "collide.js", "export const CLEAR = 1.75;", "export const CLEAR = 1.5;", [13, 24, 28], "CLEAR 1.5"),
    ("C2", "collide.js", "poly, pts, within = 20)", "poly, pts, within = 2)", [13, 24, 28], "search reach 2 m"),
    ("C3", "collide.js", "reach + CLEAR + within)", "reach + CLEAR)", [13, 24, 28], "near filter without the search reach"),
    ("C4", "collide.js", "s = Math.sin(rot),", "s = -Math.sin(rot),", [15, 16, 28], "rotation sign flipped"),
    ("C7", "collide.js", "return inside ? -d : d;", "return d;", [24, 28], "depth inside read as distance outside"),
    ("C8", "collide.js", "if (m >= CLEAR && (!best", "if (m >= CLEAR - 0.3 && (!best", [13, 24, 28], "accepts 1.45"),
]
PLANTED_NEAREST = [
    ("C5", "collide.js", "for (let k = 0; k < 32; k++) {", "for (let k = 0; k < 8; k++) {", "eight directions (with the step below)"),
    ("C6", "collide.js", "r += 0.25)", "r += 1)", "rings one metre apart"),
]


def make_mutant(mid, edits):
    dst = f"{SP}/mut/{mid}/world"
    shutil.rmtree(f"{SP}/mut/{mid}", ignore_errors=True)
    shutil.copytree(HEAD_WORLD, dst)
    for fname, old, new in edits:
        p = f"{dst}/{fname}"
        text = open(p).read()
        assert text.count(old) == 1, f"{mid}: {old!r} matches {text.count(old)} times in {fname}"
        open(p, "w").write(text.replace(old, new))
    return dst


def cmd_planted():
    control = {}
    for mid, fname, old, new, kinds, note in PLANTED:
        for who, head in (("control", HEAD_WORLD), (mid, make_mutant(mid, [(fname, old, new)]))):
            if who == "control" and tuple(kinds) in control:
                continue
            objs, info = run_node("sweep", {"tier": "desktop", "kinds": kinds, "stride": 2.0}, head_world=head, max_s=900)
            if info["killed"] or info["rc"] != 0 or not objs:
                print(f"  {who}: RUN FAILED {info}")
                continue
            agg = {k: sum(o[k] for o in objs) for k in ("n", "moved", "stayViol", "headShort25", "hardHit", "shapeBad")}
            agg["maxShort25"] = max(o["maxShort25"] for o in objs)
            agg["maxShort02"] = max(o["maxShort02"] for o in objs)
            agg["maxDisp"] = max(o["maxDisp"] for o in objs)
            if who == "control":
                control[tuple(kinds)] = agg
                print(f"control kinds {kinds}: {json.dumps(agg)}")
            else:
                c = control[tuple(kinds)]
                caught = (agg["headShort25"] > c["headShort25"]) or (agg["hardHit"] > c["hardHit"]) or (agg["stayViol"] > c["stayViol"]) or agg["maxShort25"] > c["maxShort25"] + 1e-4
                print(f"{mid} ({note}) kinds {kinds}: {json.dumps(agg)} -> {'CAUGHT' if caught else 'NOT CAUGHT'}")
    print("-- nearest-spot oracle on the search-grid defects")
    for kinds in ([13], [24]):
        base = None
        for who, head in (("control", HEAD_WORLD),) + tuple((mid, make_mutant(mid, [(f, o, n)] + ([("collide.js", "cx = x + r * Math.cos((k * Math.PI) / 16), cz = z + r * Math.sin((k * Math.PI) / 16)", "cx = x + r * Math.cos((k * Math.PI) / 4), cz = z + r * Math.sin((k * Math.PI) / 4)")] if mid == "C5" else []))) for mid, f, o, n, _ in PLANTED_NEAREST):
            objs, info = run_node("nearest", {"tier": "desktop", "kinds": kinds, "stride": 4.0, "perKind": 4}, head_world=head, max_s=9000)
            if info["killed"] or info["rc"] != 0 or not objs:
                print(f"  {who}: RUN FAILED {info}")
                continue
            ov = [r["overshoot"] for r in objs[0]["nearest"]["rows"] if r["overshoot"] is not None]
            line = f"  kinds {kinds} {who}: overshoot " + (f"min {min(ov):.3f} max {max(ov):.3f}" if ov else "n/a")
            if who == "control":
                base = max(ov) if ov else None
            else:
                line += "  -> " + ("CAUGHT" if ov and base is not None and max(ov) > base + 0.1 else "NOT CAUGHT")
            print(line, flush=True)


OPT_EDITS = [  # the room test of standClear: the nearest line points first, and a candidate is refused as soon as one point is nearer than CLEAR
    ("  const near = pts.filter(([px, pz]) => Math.hypot(px - x, pz - z) < reach + CLEAR + within);",
     "  const near = pts.filter(([px, pz]) => Math.hypot(px - x, pz - z) < reach + CLEAR + within).sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z));"),
    ("    for (const [px, pz] of near) { const dx = px - cx, dz = pz - cz; m = Math.min(m, outside(poly, dx * c - dz * s, dx * s + dz * c)); }",
     "    for (const [px, pz] of near) { const dx = px - cx, dz = pz - cz; m = Math.min(m, outside(poly, dx * c - dz * s, dx * s + dz * c)); if (m < CLEAR) return m; }"),
]


def cmd_make_opt():
    dst = SP + "/opt/world"
    shutil.rmtree(SP + "/opt", ignore_errors=True)
    shutil.copytree(HEAD_WORLD, dst)
    path = dst + "/collide.js"
    text = open(path).read()
    for old, new in OPT_EDITS:
        assert text.count(old) == 1, f"an edit matches {text.count(old)} times"
        text = text.replace(old, new)
    open(path, "w").write(text)
    print("variant world:", dst)


def cmd_variant():
    """The head against a copy of itself with OPT_EDITS in collide.js: BASE_WORLD must be the head's world, HEAD_WORLD the copy (see cmd_make_opt)."""
    def banner(title):
        print(f"\n##### {title}\n", flush=True)

    base = {"tier": "desktop", "stride": "1", "per": "8", "kinds": None, "tag": "v1", "head": HEAD_WORLD, "per-kind": "4", "n": None}
    banner("the fixed day: the head against the variant")
    cmd_fixed()
    tot = {"n": 0, "moved": 0, "shapeBad": 0, "yBad": 0, "cpuBase": 0.0, "cpuHead": 0.0}
    for tag, extra in (("v1", {}), ("v500", {"n": "500"})):
        banner(f"sweep {tag}, desktop, every kind: positions of the variant against the head's")
        rows, t = summary(sweep({**base, **extra, "tag": tag}, quiet=True))
        banner(f"sweep {tag}, phone, kinds 15 20 24")
        rows2, t2 = summary(sweep({**base, **extra, "tier": "phone", "kinds": "15,20,24", "tag": tag + "p"}, quiet=True), only_kinds={15, 20, 24})
        for rr in (rows, rows2):
            for x in rr:
                for k in ("n", "moved", "shapeBad", "yBad"):
                    tot[k] += x[k]
                tot["cpuBase"] += x.get("cpuBase", 0.0)
                tot["cpuHead"] += x.get("cpuHead", 0.0)
    banner("CPU time of placeLandmarks, one landmark per call: the head (columns 'base') against the variant (columns 'head')")
    cmd_timing({**base, "tag": "vt1", "n": "60", "per": "8"})
    cmd_timing({**base, "tier": "phone", "kinds": "15,24", "tag": "vt1p", "n": "60", "per": "2"})
    banner("VARIANT TOTALS")
    print(f"placements compared {tot['n']}, positions that differ from the head's {tot['moved']}, shapes that differ {tot['shapeBad']}, height rule broken {tot['yBad']}; "
          f"CPU ms summed over the sweeps: head {tot['cpuBase']:.0f}, variant {tot['cpuHead']:.0f}")


def cmd_all():
    def banner(title):
        print(f"\n##### {title}\n", flush=True)

    base = {"tier": "desktop", "stride": "1", "per": "8", "kinds": None, "tag": "s1", "head": HEAD_WORLD, "per-kind": "4", "n": None}
    banner("oracle self-test")
    cmd_selftest()
    banner("the fixed day")
    cmd_fixed()
    banner("the layout pins")
    cmd_pins()
    for tag, extra in (("s1", {}), ("n500", {"n": "500"})):
        banner(f"sweep {tag}, desktop, every kind")
        summary(sweep({**base, **extra, "tag": tag}, quiet=True))
        banner(f"sweep {tag}, phone, the kinds that read the tier (15 rider, 20 fire, 24 band)")
        summary(sweep({**base, **extra, "tier": "phone", "kinds": "15,20,24", "tag": tag + "p"}, quiet=True), only_kinds={15, 20, 24})
    banner("CPU time of placeLandmarks")
    cmd_timing({**base, "tag": "t1", "n": "60", "per": "8"})
    cmd_timing({**base, "tier": "phone", "kinds": "15,24", "tag": "t1p", "n": "60", "per": "2"})
    banner("determinism")
    cmd_determinism()
    banner("the nearest-spot oracle")
    cmd_nearest({**base, "stride": "2", "tag": "n1"})
    banner("planted defects")
    cmd_planted()


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    a = args_of(sys.argv[2:])
    if cmd == "selftest":
        cmd_selftest()
    elif cmd == "fixed":
        cmd_fixed()
    elif cmd == "sweep":
        path = sweep(a)
        summary(path)
    elif cmd == "summary":
        summary(f"{OUT}/sweep_{a['tag'] if len(sys.argv) < 3 else sys.argv[2]}.jsonl")
    elif cmd == "nearest":
        cmd_nearest(a)
    elif cmd == "pins":
        cmd_pins()
    elif cmd == "timing":
        cmd_timing(a)
    elif cmd == "determinism":
        cmd_determinism()
    elif cmd == "planted":
        cmd_planted()
    elif cmd == "all":
        cmd_all()
    elif cmd == "make_opt":
        cmd_make_opt()
    elif cmd == "variant":
        cmd_variant()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
