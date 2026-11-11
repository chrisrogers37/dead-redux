"""usage: recount.py <row-dir> [grey ...]

The counter again, from a row's saved frames (PNG, top-down) instead of the page's read-back: each 2x2 block's WCAG relative luminance
over each grey, a transition on a swing of 0.1 against the last extreme the other way with the darker side under 0.8, and the most
transitions in any window of 30 frames among the release's windows (those holding a frame of the release, from counts.json). Prints, per
grey, the most, the blocks at it and the first of them, beside what the page's counter wrote.
"""

import json
import os
import sys

import numpy as np
from PIL import Image

D = sys.argv[1]
C = json.load(open(os.path.join(D, "counts.json")))
greys = sys.argv[2:] or list(C["greys"])
FPS = 30
first, last = C["frames"]
rel0, rel1 = C["release"]
c = np.arange(256) / 255
LUT = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32).astype(np.float64)
frames = range(first, last + 1)
state = {g: None for g in greys}
for f in frames:
    rgb = np.asarray(Image.open(os.path.join(D, "frames", f"f{f:+04d}.png")).convert("RGB"), dtype=np.int32)
    H, W, _ = rgb.shape
    for g in greys:
        v = int(g.removeprefix("grey"))
        q = np.minimum(255, rgb + v)
        lum = 0.2126 * LUT[q[..., 0]] + 0.7152 * LUT[q[..., 1]] + 0.0722 * LUT[q[..., 2]]
        L = (lum[0::2, 0::2] + lum[0::2, 1::2] + lum[1::2, 0::2] + lum[1::2, 1::2]) / 4
        s = state[g]
        if s is None:
            state[g] = s = {"ext": L.astype(np.float32), "dir": np.zeros(L.shape, np.int8), "win": np.zeros(L.shape, np.int16),
                            "hist": {}, "best": np.zeros(L.shape, np.int16), "at": np.full(L.shape, -9999, np.int16)}
            s["hist"][f] = np.zeros(L.shape, bool)
            continue
        e = s["ext"].astype(np.float64)
        d = s["dir"]
        up = np.zeros(L.shape, bool)
        down = np.zeros(L.shape, bool)
        z = d == 0
        up |= z & (L - e >= 0.1) & (e < 0.8)
        down |= z & ~up & (e - L >= 0.1) & (L < 0.8)
        p = d > 0
        higher = p & (L > e)
        down |= p & ~higher & (e - L >= 0.1) & (L < 0.8)
        m = d < 0
        lower = m & (L < e)
        up |= m & ~lower & (L - e >= 0.1) & (e < 0.8)
        newext = higher | lower | up | down
        s["ext"] = np.where(newext, L, e).astype(np.float32)
        s["dir"] = np.where(up, 1, np.where(down, -1, d)).astype(np.int8)
        t = up | down
        s["hist"][f] = t
        s["win"] += t
        old = s["hist"].pop(f - FPS, None)
        if old is not None:
            s["win"] -= old
        if f >= rel0 and f - (FPS - 1) <= rel1:
            better = s["win"] > s["best"]
            s["best"] = np.where(better, s["win"], s["best"])
            s["at"] = np.where(better, f, s["at"])
for g in greys:
    s = state[g]
    top = int(s["best"].max())
    ys, xs = np.nonzero(s["best"] == top)
    page = C["greys"][g]
    print(f"{g}: recount {top} at {len(xs)} blocks, first ({xs[0]}, {ys[0]}) window ending f{int(s['at'][ys[0], xs[0]])}"
          f" | page {page['most']} at {page['blocks']} blocks" + (f", first ({page['at'][0]['x']}, {page['at'][0]['y']})" if page["at"] else ""))
