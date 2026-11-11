"""usage: capture_release.py <out-dir> <site-x> <plan-json>

The release after a peak, rendered in headless Chromium from make_site.sh's site (dead-redux main at eaf2181c; its main.js also puts
the renderer, scene, camera, crowd, visitor's bear and stage on window.__x). The page runs on a virtual clock and is not stepped while a
row drives the rig. The harness and counter are #128's flash rows':

- ?pose=crowd's own camera on a desktop at 800x500, everything but the rig hidden over black, the rig's five numbers written each frame
  at 30 frames a second;
- the beams' added light over eight flat greys, from the page's dark to a relative luminance of 0.75;
- each 2x2 block's WCAG relative luminance through the transition counter: a swing of 10 % against the last extreme the other way, its
  darker side under 0.8; the most transitions in any one second (30 frames); two make a flash.

A row is one release: a real peak of the maps, the build-up falling from it to nothing, with main's own modules computing what the frame
writes. From 25 s before the peak, at 30 frames a second, as main.js's frame does it: the build-up toward maps.js buildUp at most 1.25 a
second; the map's loudness, low end and brightness (maps.js mapDrive) through audio.js mappings with the weight at 1, as when the map
drives the world; the swing eased toward the dance with a 0.8 s time constant; the rig lit (the crowd dances) and not lifted. The rig's
phase is the row's beat at the peak plus the row's tempo since. Frames are drawn from 3 s before the peak to 1.8 s after it: the first
2 s set the counter's state, its per-second output runs over the windows that end from 1 s before the peak to 1.8 s after it, and the
release's windows are those holding any frame of the release (the build-up under 1, from the frame after the peak to the one it reaches
0, 0.8 s on).

Writes records-<run>.json, each row's frames (the beams over black, as read back; the counter adds each grey to these bytes), its counts and
each grey's per-block count map. Stops after a row that reads more than 6 transitions in a second (over 3 flashes) at any grey. Between rows it stops itself, keeping
the rows done, when MemAvailable is under 4,100 MiB or the load is high; a later run skips the rows already written.
"""

import base64
import json
import os
import subprocess
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

OUT, SITE, PLAN = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
URL = "http://127.0.0.1:8781/page.html"
FPS = 30
GREYS = (11, 64, 96, 128, 160, 192, 208, 224)
BGS = {f"grey{v}": [v, v, v] for v in GREYS}
AMBER, MAGENTA = 0xE8B04B, 0xD6508A
FROM_F, LINE_F, LAST_F = -3 * FPS, -1 * FPS, round(1.8 * FPS)
LIMIT = 6
# Between rows the job stops itself, rows done kept, when the host runs short of memory or the load is high.
PAUSE_MIB = 4100
# A block's count map: 32 levels a transition, so 8 or more are white.
SCALE = bytes(min(255, 32 * b) for b in range(256))

CLOCK = """(() => {
  let vnow = performance.now(), queue = [];
  performance.now = () => vnow;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__vt = { step(ms) { vnow += ms; const q = queue; queue = []; for (const cb of q) cb(vnow); return q.length; } };
})();"""

# The transition counter: #128's, keeping every transition so each second's count, and where and when, can be read back.
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

# Everything but the rig hidden, over black.
SOLO = """() => {
  const X = window.__x, rig = X.stage.rig.mesh;
  window.__hidden = [];
  X.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o !== rig && o.visible) { o.visible = false; window.__hidden.push(o); } });
  X.scene.background = null; X.renderer.setClearColor(0x000000, 1);
  return window.__hidden.length;
}"""

# The frame behind the beams, the page's own (idle, the rig dark), for placing what the counter finds.
BEHIND = """() => {
  const X = window.__x, gl = X.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  X.renderer.render(X.scene, X.camera);
  return { rig: X.stage.rig.mesh.visible, png: X.renderer.domElement.toDataURL('image/png') };
}"""

# One release.
RELEASE = """async ([row, fps, from, lineFrom, last, keep]) => {
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
  let build = 0, swing = 0.4 + 1.2 * maps.mapDrive(track, row.peak - 25).loud;
  const log = [], frames = [];
  let relFirst = null, relLast = null;
  window.__fl.reset(lineFrom - (fps - 1));
  for (let f = -25 * fps; f <= last; f++) {
    const t = row.peak + f * dt;
    const drive = maps.mapDrive(track, t);
    build = toward(build, maps.buildUp(track, t), dt / 0.8);
    const l2 = audio.mappings(drive, 1, build);
    swing += (l2.dance - swing) * k;
    if (f < from) continue;
    if (f > 0 && l2.rise < 1 && relFirst === null) relFirst = f;
    if (relFirst !== null && relLast === null && l2.rise <= 1e-9) relLast = f;
    const beats = row.phase + (f * dt * row.bpm) / 60;
    show[0] = ((beats % 8) + 8) % 8; show[1] = 1; show[2] = swing; show[3] = l2.rise; show[4] = 0;
    X.renderer.render(X.scene, X.camera);
    const inRelease = relFirst !== null && f >= relFirst && f - (fps - 1) <= (relLast ?? f);
    window.__fl.step(f, f >= lineFrom, inRelease);
    frames.push(X.renderer.domElement.toDataURL('image/png'));
    log.push([f, +drive.loud.toFixed(4), +l2.rise.toFixed(4), +swing.toFixed(4), +show[0].toFixed(4)]);
  }
  return { relFirst, relLast, log, frames, counts: window.__fl.result(keep) };
}"""


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


def save(records):
    with open(RECORDS, "w") as f:
        json.dump(records, f, indent=1)


def png(data_url, path):
    with open(path, "wb") as f:
        f.write(base64.b64decode(data_url.split(",", 1)[1]))


os.makedirs(OUT, exist_ok=True)
# Each run its own record: a run after a pause keeps the first's.
RECORDS = os.path.join(OUT, f"records-{sum(n.startswith('records-') for n in os.listdir(OUT)) + 1}.json")
records = []
rec = {"part": "desktop 800x500, ?pose=crowd", "console": [], "rows": []}
records.append(rec)
server = subprocess.Popen([sys.executable, "-m", "http.server", "8781", "--bind", "127.0.0.1", "--directory", SITE],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
started = time.time()
try:
    time.sleep(1.5)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        try:
            context = browser.new_context(viewport={"width": 800, "height": 500})
            context.add_init_script(CLOCK)
            context.add_init_script(COUNTER)
            page = context.new_page()
            page.on("console", lambda m: rec["console"].append(f"{m.type}: {m.text}"[:300]) if m.type in ("error", "warning") and len(rec["console"]) < 200 else None)
            page.on("pageerror", lambda e: rec["console"].append(f"pageerror: {e}"[:300]))
            page.goto(URL + "?pose=crowd", wait_until="load", timeout=90_000)
            page.wait_for_selector("#world[data-world='ready']", timeout=120_000)
            for _ in range(10):
                page.evaluate("(ms) => window.__vt.step(ms)", 1000 / 30)
            size = page.evaluate("() => { const gl = window.__x.renderer.getContext(); return [gl.drawingBufferWidth, gl.drawingBufferHeight]; }")
            rec["buffer"] = size
            behind = page.evaluate(BEHIND)
            rec["behind_rig_drawn"] = behind["rig"]
            png(behind["png"], os.path.join(OUT, "behind.png"))
            rec["hidden"] = page.evaluate(SOLO)
            page.evaluate("([w, h, f, b]) => window.__fl.init(w, h, f, b)", [size[0], size[1], FPS, BGS])
            save(records)
            for row in PLAN["rows"]:
                row = {**row, "c0": AMBER, "c1": MAGENTA}
                if os.path.exists(os.path.join(OUT, "rows", row["name"], "counts.json")):
                    continue
                ma, l1, l5 = host()
                if ma < PAUSE_MIB or l5 > 22 or l1 > 35:
                    rec["paused"] = f"before {row['name']}: MemAvailable {ma} MiB, load {l1} {l5}"
                    break
                t0 = time.time()
                r = page.evaluate(RELEASE, [row, FPS, FROM_F, LINE_F, LAST_F, 12])
                entry = {"row": row["name"], "wall_s": round(time.time() - t0, 1)}
                if "error" in r:
                    entry["error"] = r["error"]
                    rec["rows"].append(entry)
                    save(records)
                    raise RuntimeError(r["error"])
                d = os.path.join(OUT, "rows", row["name"])
                os.makedirs(os.path.join(d, "frames"), exist_ok=True)
                for (f, *_), url in zip(r["log"], r["frames"]):
                    png(url, os.path.join(d, "frames", f"f{f:+04d}.png"))
                counts = {}
                for grey, c in r["counts"].items():
                    raw = base64.b64decode(c.pop("map"))
                    Image.frombytes("L", (size[0] // 2, size[1] // 2), raw.translate(SCALE)).save(os.path.join(d, f"most-{grey}.png"))
                    counts[grey] = c
                with open(os.path.join(d, "counts.json"), "w") as f:
                    json.dump({"row": row, "frames": [FROM_F, LAST_F], "line_from": LINE_F, "release": [r["relFirst"], r["relLast"]],
                               "log": {"columns": ["frame", "loud", "rise", "swing", "phase"], "rows": r["log"]}, "greys": counts}, f)
                entry.update({"release": [r["relFirst"], r["relLast"]],
                              "most": {g: c["most"] for g, c in counts.items()}, "blocks": {g: c["blocks"] for g, c in counts.items()},
                              "before": {g: max([m for f, m, _ in c["line"] if f <= 0] or [0]) for g, c in counts.items()}})
                rec["rows"].append(entry)
                save(records)
                top = max(entry["most"].values())
                if top > LIMIT:
                    rec["stopped"] = f"{row['name']} reads {top} transitions in a second (over 3 flashes)"
                    break
            rec["ok"] = True
        except Exception as e:
            rec["ok"] = False
            rec["error"] = str(e)[:600]
        finally:
            browser.close()
finally:
    server.terminate()
    rec["wall_s"] = round(time.time() - started, 1)
    save(records)
sys.exit(0 if rec.get("ok") else 1)
