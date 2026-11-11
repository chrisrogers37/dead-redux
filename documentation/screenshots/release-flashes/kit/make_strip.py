"""usage: make_strip.py <main-row-dir> <fix-row-dir> <out.png>

Two rows of one release's frames (the beams alone over black, from ?pose=crowd's camera), cropped to the fan above the stage: main at the
peak, 0.4 s and 0.8 s after it (its beams are open by then); this head at the same three and at 4 s and 8 s. Each panel is put over the
page's own frame without the rig (behind.png), lightened as additive blending lightens it, for a sense of where the fan stands.
"""

import os
import sys

from PIL import Image, ImageChops

MAIN, FIX, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
BOX = (150, 0, 650, 260)
behind = Image.open(os.path.join(os.path.dirname(os.path.dirname(FIX)), "behind.png")).convert("RGB").crop(BOX)


def panel(row_dir, f):
    p = os.path.join(row_dir, "frames", f"f{f:+04d}.png")
    if not os.path.exists(p):
        return None
    return ImageChops.add(behind, Image.open(p).convert("RGB").crop(BOX))


cols = [0, 12, 24, 120, 240]
w, h, gap = BOX[2] - BOX[0], BOX[3] - BOX[1], 6
strip = Image.new("RGB", (len(cols) * (w + gap) - gap, 2 * h + gap), (32, 32, 32))
for i, f in enumerate(cols):
    for j, d in enumerate((MAIN, FIX)):
        im = panel(d, f)
        if im is not None:
            strip.paste(im, (i * (w + gap), j * (h + gap)))
strip.save(OUT)
print(OUT, strip.size)
