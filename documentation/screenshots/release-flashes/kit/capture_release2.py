"""usage: capture_release2.py <out-dir> <job-json>

capture_release.py's harness and counter (the same CLOCK, COUNTER, SOLO and BEHIND, copied from it unchanged), over the parts of a job:
each part a site (make_site.sh at a commit) served on its own port, and its rows.

A release row is capture_release.py's, with what main.js writes for the rig's gather as a row setting: "rise" (main at eaf2181c, the
gather is the build-up as it acts) or a number of seconds T (the gather follows the build-up as it rises and falls no faster than 1 / T a
second). From 40 s before the peak, at 30 frames a second, unrendered until 3 s before it; then drawn until the first window that holds
no frame of the release, the release being the frames from the one after the peak to the one where the gather reaches 0. The per-second
output runs over every window from the one that ends 1 s before the peak, and each block's most over all of them.

A "rows128" part runs #128's beams-alone rows (capture_round1c.py's ROW): the rig's numbers written directly, 1 s and then 4 s counted.

A part with "stop_over" stops the job after a row that reads more than that many transitions in a second at any grey. Between rows the
job stops itself, keeping the rows done, when MemAvailable is under 4,100 MiB or the load is high; a later run skips rows written.
"""

import base64
import json
import os
import subprocess
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

OUT, JOB = sys.argv[1], json.load(open(sys.argv[2]))
FPS = 30
GREYS = (11, 64, 96, 128, 160, 192, 208, 224)
BGS = {f"grey{v}": [v, v, v] for v in GREYS}
AMBER, MAGENTA = 0xE8B04B, 0xD6508A
FROM_F, LINE_F, CAP_F = -3 * FPS, -1 * FPS, 12 * FPS
PAUSE_MIB = 4100
SCALE = bytes(min(255, 32 * b) for b in range(256))

CLOCK = """(() => {
  let vnow = performance.now(), queue = [];
  performance.now = () => vnow;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__vt = { step(ms) { vnow += ms; const q = queue; queue = []; for (const cb of q) cb(vnow); return q.length; } };
})();"""

COUNTER = """(() => {
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  let W = 0, H = 0, cw = 0, ch = 0, N = 0, fps = 30, buf = null, sets = [], keepFrom = 0;
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  window.__fl = {
    init(w, h, rate, bgs) {
      W = w; H = h; cw = w >> 1; ch = h >> 1; N = cw * ch; fps = rate; buf = new Uint8Array(w * h * 4);
      sets = Object.entries(bgs).map(([name, bg]) => ({ name, bg, ext: new Float32Array(N), dir: new Int8Array(N), seen: new Uint8Array(N),
        win: new Uint8Array(N), out: new Map(), best: new Uint8Array(N), bestAt: new Int16Array(N), trans: new Map(), line: [] }));
    },
    /* `from`: the first frame whose transitions are kept for the blocks read back (the first a counted window can hold). */
    reset(from) {
      keepFrom = from;
      for (const s of sets) { s.ext.fill(0); s.dir.fill(0); s.seen.fill(0); s.win.fill(0); s.out = new Map(); s.best.fill(0);
        s.bestAt.fill(-32768); s.trans = new Map(); s.line = []; }
    },
    /* Frame f: each block's transitions. A transition at frame g counts in the windows that end at f with f - g < fps. `line` puts this
       window's most in the per-second output; `best` keeps each block's most over the release's windows. */
    step(f, line, best) {
      const gl = window.__x.renderer.getContext();
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (const s of sets) {
        const gone = s.out.get(f);
        if (gone) { for (const i of gone) s.win[i]--; s.out.delete(f); }
        const [r0, g0, b0] = s.bg;
        for (let by = 0; by < ch; by++) for (let bx = 0; bx < cw; bx++) {
          let L = 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const p = 4 * ((2 * by + dy) * W + 2 * bx + dx);
            L += 0.2126 * LUT[Math.min(255, r0 + buf[p])] + 0.7152 * LUT[Math.min(255, g0 + buf[p + 1])] + 0.0722 * LUT[Math.min(255, b0 + buf[p + 2])];
          }
          L /= 4;
          const i = by * cw + bx;
          if (!s.seen[i]) { s.seen[i] = 1; s.ext[i] = L; continue; }
          const e = s.ext[i];
          let swung = 0;
          if (s.dir[i] === 0) {
            if (L - e >= 0.1 && e < 0.8) swung = 1; else if (e - L >= 0.1 && L < 0.8) swung = -1;
          } else if (s.dir[i] > 0) {
            if (L > e) s.ext[i] = L; else if (e - L >= 0.1 && L < 0.8) swung = -1;
          } else {
            if (L < e) s.ext[i] = L; else if (L - e >= 0.1 && e < 0.8) swung = 1;
          }
          if (!swung) continue;
          s.dir[i] = swung; s.ext[i] = L; s.win[i]++;
          let list = s.out.get(f + fps); if (!list) s.out.set(f + fps, list = []); list.push(i);
          if (f >= keepFrom) { let tr = s.trans.get(i); if (!tr) s.trans.set(i, tr = []); tr.push([f, swung > 0 ? '+' : '-']); }
        }
        if (line || best) {
          let top = 0, n = 0;
          for (let i = 0; i < N; i++) {
            const c = s.win[i];
            if (c > top) { top = c; n = 1; } else if (c === top && c > 0) n++;
            if (best && c > s.best[i]) { s.best[i] = c; s.bestAt[i] = f; }
          }
          if (line) s.line.push([f, top, n]);
        }
      }
    },
    /* Per grey: the most over the release's windows, how many blocks reach it, the first `keep` of them (x, y from the frame's top, in
       blocks; the window's last frame; the block's transitions, each its frame, + rising, - falling), the per-second output, and each
       block's most as base64 bytes from the frame's top. */
    result(keep) {
      return Object.fromEntries(sets.map((s) => {
        let top = 0, blocks = 0;
        for (let i = 0; i < N; i++) if (s.best[i] > top) top = s.best[i];
        const at = [];
        for (let i = 0; i < N; i++) {
          if (top === 0 || s.best[i] !== top) continue;
          blocks++;
          if (at.length < keep) at.push({ x: i % cw, y: ch - 1 - Math.floor(i / cw), end: s.bestAt[i],
            trans: s.trans.get(i) || [] });
        }
        const map = new Uint8Array(N);
        for (let y = 0; y < ch; y++) map.set(s.best.subarray((ch - 1 - y) * cw, (ch - y) * cw), y * cw);
        return [s.name, { most: top, blocks, at, line: s.line, map: b64(map) }];
      }));
    },
  };
})();"""

SOLO = """() => {
  const X = window.__x, rig = X.stage.rig.mesh;
  window.__hidden = [];
  X.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o !== rig && o.visible) { o.visible = false; window.__hidden.push(o); } });
  X.scene.background = null; X.renderer.setClearColor(0x000000, 1);
  return window.__hidden.length;
}"""

BEHIND = """() => {
  const X = window.__x, gl = X.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  X.renderer.render(X.scene, X.camera);
  return { rig: X.stage.rig.mesh.visible, png: X.renderer.domElement.toDataURL('image/png') };
}"""

RELEASE = """async ([row, fps, from, lineFrom, cap, keep, save]) => {
  const X = window.__x, show = X.stage.rig.show, rig = X.stage.rig.mesh, u = rig.material.uniforms;
  const maps = await import('/world/maps.js'), audio = await import('/world/audio.js');
  const raw = await (await fetch('/maps/' + row.show + '.json')).json();
  if (maps.checkMap(raw).length) return { error: 'the map fails checkMap' };
  const track = maps.readMap(raw).tracks[row.index];
  if (track.title !== row.title) return { error: 'track ' + row.index + ' is ' + track.title };
  u.uC0.value.setHex(row.c0); u.uC1.value.setHex(row.c1);
  rig.visible = true;
  const dt = 1 / fps, k = 1 - Math.exp(-dt / 0.8);
  const toward = (value, target, step) => value + Math.max(-step, Math.min(step, target - value));
  let build = 0, swing = 0.4 + 1.2 * maps.mapDrive(track, row.peak - 40).loud, gather = 0;
  const log = [], frames = {};
  let relFirst = null, relLast = null;
  window.__fl.reset(lineFrom - (fps - 1));
  for (let f = -40 * fps; f <= cap; f++) {
    const t = row.peak + f * dt;
    const drive = maps.mapDrive(track, t);
    build = toward(build, maps.buildUp(track, t), dt / 0.8);
    const l2 = audio.mappings(drive, 1, build);
    swing += (l2.dance - swing) * k;
    gather = row.gather === 'rise' ? l2.rise : Math.fround(Math.max(l2.rise, gather - dt / row.gather));
    if (f < from) continue;
    if (f > 0 && gather < 1 && relFirst === null) relFirst = f;
    if (relFirst !== null && relLast === null && gather <= 1e-9) relLast = f;
    const beats = row.phase + (f * dt * row.bpm) / 60;
    show[0] = ((beats % 8) + 8) % 8; show[1] = 1; show[2] = swing; show[3] = gather; show[4] = 0;
    X.renderer.render(X.scene, X.camera);
    window.__fl.step(f, f >= lineFrom, f >= lineFrom);
    if (save.includes(f)) frames[f] = X.renderer.domElement.toDataURL('image/png');
    log.push([f, +drive.loud.toFixed(4), +l2.rise.toFixed(4), +show[3].toFixed(4), +swing.toFixed(4), +show[0].toFixed(4)]);
    if (relLast !== null && f >= relLast + fps) break;
  }
  return { relFirst, relLast, log, frames, counts: window.__fl.result(keep) };
}"""

# #128's beams-alone rows, as capture_round1c.py's ROW wrote them, counted with this counter: 1 s, a fresh counter, then 4 s counted.
ROW128 = """async ([row, fps, warm, count]) => {
  const X = window.__x, show = X.stage.rig.show, rig = X.stage.rig.mesh, u = rig.material.uniforms;
  u.uC0.value.setHex(row.c0); u.uC1.value.setHex(row.c1);
  rig.visible = true;
  const dt = 1 / fps, k = 1 - Math.exp(-dt / 0.8);
  const loud = (beat) => row.loud === 'half' ? (Math.floor(2 * beat) % 2 ? row.hi : row.lo)
    : row.loud === 'sine' ? row.mid + row.amp * Math.sin(2 * Math.PI * beat) : null;
  const target = (beat) => { const L = loud(beat); return L === null ? row.swing : 0.4 + 1.2 * L; };
  let swing = target(0);
  const frames = Math.round((warm + count) * fps), w = Math.round(warm * fps);
  window.__fl.reset(0);
  for (let f = 0; f < frames; f++) {
    if (f === w) window.__fl.reset(w);
    const t = f * dt, beat = (t * row.bpm) / 60;
    swing = row.raw ? target(beat) : swing + (target(beat) - swing) * k;
    show[0] = beat % 8; show[1] = 1; show[2] = swing; show[3] = row.gather; show[4] = 0;
    X.renderer.render(X.scene, X.camera);
    window.__fl.step(f, false, f >= w);
  }
  const r = window.__fl.result(0);
  return Object.fromEntries(Object.entries(r).map(([g, c]) => [g, { most: c.most, blocks: c.blocks }]));
}"""

ROWS128 = [
    {"name": "peak: gathered, amber, 159, the loudest dance held", "bpm": 159, "gather": 1, "swing": 1.6, "loud": None},
    {"name": "loudness 0.45 / 0.65 each half beat, 159, eased", "bpm": 159, "gather": 0, "loud": "half", "lo": 0.45, "hi": 0.65},
    {"name": "loudness 0.45 / 0.65 each half beat, 159, raw", "bpm": 159, "gather": 0, "loud": "half", "lo": 0.45, "hi": 0.65, "raw": True},
    {"name": "loudness 0.55 +- 0.10 at the beat's rate, 159, eased", "bpm": 159, "gather": 0, "loud": "sine", "mid": 0.55, "amp": 0.1},
    {"name": "loudness 0.55 +- 0.10 at the beat's rate, 159, raw", "bpm": 159, "gather": 0, "loud": "sine", "mid": 0.55, "amp": 0.1, "raw": True},
]


def host():
    """MemAvailable in MiB and the 1- and 5-minute loads, read without a pipe."""
    ma = 0
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith("MemAvailable:"):
                ma = int(line.split()[1]) // 1024
    with open("/proc/loadavg") as f:
        l1, l5 = (float(v) for v in f.read().split()[:2])
    return ma, l1, l5


def png(data_url, path):
    with open(path, "wb") as f:
        f.write(base64.b64decode(data_url.split(",", 1)[1]))


os.makedirs(OUT, exist_ok=True)
RECORDS = os.path.join(OUT, f"records-{sum(n.startswith('records-') for n in os.listdir(OUT)) + 1}.json")
records = []


def save():
    with open(RECORDS, "w") as f:
        json.dump(records, f, indent=1)


servers = {}
started = time.time()
try:
    for part in JOB["parts"]:
        if part["port"] not in servers:
            servers[part["port"]] = subprocess.Popen([sys.executable, "-m", "http.server", str(part["port"]), "--bind", "127.0.0.1", "--directory", part["site"]],
                                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        try:
            halt = None
            for part in JOB["parts"]:
                if halt:
                    break
                rec = {"part": part["name"], "site": part["site"], "console": [], "rows": []}
                records.append(rec)
                pdir = os.path.join(OUT, part["name"])
                os.makedirs(pdir, exist_ok=True)
                context = browser.new_context(viewport={"width": 800, "height": 500})
                context.add_init_script(CLOCK)
                context.add_init_script(COUNTER)
                page = context.new_page()
                page.on("console", lambda m, rec=rec: rec["console"].append(f"{m.type}: {m.text}"[:300]) if m.type in ("error", "warning") and len(rec["console"]) < 200 else None)
                page.on("pageerror", lambda e, rec=rec: rec["console"].append(f"pageerror: {e}"[:300]))
                try:
                    page.goto(f"http://127.0.0.1:{part['port']}/page.html?pose=crowd", wait_until="load", timeout=90_000)
                    page.wait_for_selector("#world[data-world='ready']", timeout=120_000)
                    for _ in range(10):
                        page.evaluate("(ms) => window.__vt.step(ms)", 1000 / 30)
                    size = page.evaluate("() => { const gl = window.__x.renderer.getContext(); return [gl.drawingBufferWidth, gl.drawingBufferHeight]; }")
                    rec["buffer"] = size
                    behind = page.evaluate(BEHIND)
                    png(behind["png"], os.path.join(pdir, "behind.png"))
                    rec["hidden"] = page.evaluate(SOLO)
                    page.evaluate("([w, h, f, b]) => window.__fl.init(w, h, f, b)", [size[0], size[1], FPS, BGS])
                    save()
                    if part.get("kind") == "rows128":
                        for row in ROWS128:
                            row = {**row, "c0": AMBER, "c1": MAGENTA}
                            t0 = time.time()
                            r = page.evaluate(ROW128, [row, FPS, 1, 4])
                            rec["rows"].append({"row": row["name"], "wall_s": round(time.time() - t0, 1), "most": {g: c["most"] for g, c in r.items()},
                                                "blocks": {g: c["blocks"] for g, c in r.items()}})
                            save()
                    else:
                        for row in part["rows"]:
                            row = {**row, "c0": AMBER, "c1": MAGENTA, "gather": part["gather"]}
                            d = os.path.join(pdir, "rows", row["name"])
                            if os.path.exists(os.path.join(d, "counts.json")):
                                continue
                            ma, l1, l5 = host()
                            if ma < PAUSE_MIB or l5 > 22 or l1 > 35:
                                halt = rec["paused"] = f"before {row['name']}: MemAvailable {ma} MiB, load {l1} {l5}"
                                break
                            t0 = time.time()
                            r = page.evaluate(RELEASE, [row, FPS, FROM_F, LINE_F, CAP_F, 12, part.get("save", {}).get(row["name"], [])])
                            entry = {"row": row["name"], "wall_s": round(time.time() - t0, 1)}
                            if "error" in r:
                                entry["error"] = r["error"]
                                rec["rows"].append(entry)
                                save()
                                raise RuntimeError(r["error"])
                            os.makedirs(d, exist_ok=True)
                            for f, url in r["frames"].items():
                                os.makedirs(os.path.join(d, "frames"), exist_ok=True)
                                png(url, os.path.join(d, "frames", f"f{int(f):+04d}.png"))
                            rel0, rel1 = r["relFirst"], r["relLast"]
                            counts = {}
                            for grey, c in r["counts"].items():
                                raw = base64.b64decode(c.pop("map"))
                                Image.frombytes("L", (size[0] // 2, size[1] // 2), raw.translate(SCALE)).save(os.path.join(d, f"most-{grey}.png"))
                                counts[grey] = c
                            last_f = r["log"][-1][0]
                            with open(os.path.join(d, "counts.json"), "w") as f:
                                json.dump({"row": row, "frames": [FROM_F, last_f], "line_from": LINE_F, "release": [rel0, rel1],
                                           "log": {"columns": ["frame", "loud", "rise", "gather", "swing", "phase"], "rows": r["log"]},
                                           "greys": counts}, f)

                            def split(c):
                                line = c["line"]
                                return {"before": max([m for f, m, _ in line if f <= 0] or [0]),
                                        "release": max([m for f, m, _ in line if rel0 is not None and rel0 <= f <= (rel1 if rel1 is not None else last_f) + FPS - 1] or [0]),
                                        "after": max([m for f, m, _ in line if rel1 is not None and f >= rel1 + FPS] or [0])}
                            entry.update({"release": [rel0, rel1], "frames": [FROM_F, last_f],
                                          "most": {g: c["most"] for g, c in counts.items()},
                                          "split": {g: split(c) for g, c in counts.items()}})
                            rec["rows"].append(entry)
                            save()
                            top = max(entry["most"].values())
                            if part.get("stop_over") is not None and top > part["stop_over"]:
                                halt = rec["stopped"] = f"{row['name']} reads {top} transitions in a second"
                                break
                    rec["ok"] = True
                except Exception as e:
                    rec["ok"] = False
                    rec["error"] = str(e)[:600]
                    halt = halt or "error"
                finally:
                    context.close()
                    save()
        finally:
            browser.close()
finally:
    for s in servers.values():
        s.terminate()
    records.append({"wall_s": round(time.time() - started, 1)})
    save()
sys.exit(0 if all(r.get("ok", True) for r in records) else 1)
