"""Finds the settlement markers on the Altaeus world map, for a hand check.

Usage: python3 -I scripts/map/detect_markers.py "assets/world maps/altaeus map.jpg" <out-dir>
Needs Python 3 with Pillow, numpy and scipy (not part of pnpm test). Writes <out-dir>/markers.json
and <out-dir>/markers-overlay.jpg (half size; blue = capital, red = city or village, numbered,
"c" = coastal). Put <out-dir> in a scratch folder, never in the repo.

Markers are flat, dark grey-brown rounded squares about 20 px wide. Capital markers add a light
ring and a dark octagonal frame around the square. Land is warm (red well above blue), the sea grey.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
L = (r + g + b) / 3

# Land masses at quarter size. Rivers and lakes are filled in, so each land mass is one component.
small = np.asarray(im.resize((W // 4, H // 4), Image.BILINEAR)).astype(int)
warm = small[..., 0] - small[..., 2] > 22
land = ndi.binary_opening(
    ndi.binary_fill_holes(ndi.binary_closing(warm, np.ones((5, 5)))), np.ones((3, 3)))
islands, _ = ndi.label(land)
sea = ~ndi.binary_closing(warm, np.ones((3, 3)))

# Marker fill: dark, greyish brown and flat.
fill = (r > 70) & (r < 125) & (g > 60) & (g < 110) & (b > 40) & (b < 100) & (r - b < 45)
fill = ndi.binary_opening(ndi.binary_closing(fill, np.ones((3, 3))), np.ones((11, 11)))
labels, _ = ndi.label(fill)


def framed(profile):
    """A light ring just outside the fill, then a dark frame: a capital marker."""
    k = next((j for j, v in enumerate(profile) if v > 190), None)
    return k is not None and k < 6 and any(v < 140 for v in profile[k:k + 8])


markers = []
for i, sl in enumerate(ndi.find_objects(labels)):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    h, w = y1 - y0, x1 - x0
    area = (labels[sl] == i + 1).sum()
    if not (12 <= h <= 34 and 12 <= w <= 34 and 0.6 < w / h < 1.6 and area > 0.7 * w * h):
        continue
    if x0 > W - 720 and y0 > H - 360:
        continue  # the legend's sample markers
    inner = L[y0 + 3:y1 - 3, x0 + 3:x1 - 3]
    ring = np.concatenate([L[y0 - 6:y0 - 2, x0:x1].ravel(), L[y1 + 2:y1 + 6, x0:x1].ravel(),
                           L[y0:y1, x0 - 6:x0 - 2].ravel(), L[y0:y1, x1 + 2:x1 + 6].ravel()])
    if inner.std() > 18 or np.percentile(ring, 75) - inner.mean() < 40:
        continue  # textured ink (mountains, trees, lettering), not a flat marker
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    sx, sy = cx // 4, cy // 4
    if land[max(0, sy - 8):sy + 8, max(0, sx - 8):sx + 8].mean() < 0.3:
        continue  # on open sea: the compass rose and sea lettering
    half = max(w, h) // 2
    profiles = [L[cy, cx + half:cx + half + 16], L[cy, cx - half - 16:cx - half][::-1],
                L[cy + half:cy + half + 16, cx], L[cy - half - 16:cy - half, cx][::-1]]
    near = islands[max(0, sy - 6):sy + 7, max(0, sx - 6):sx + 7]
    island = int(np.bincount(near[near > 0]).argmax()) if (near > 0).any() else 0
    coastal = bool(sea[max(0, sy - 12):sy + 13, max(0, sx - 12):sx + 13].any())  # sea within ~50 px
    markers.append({'x': int(cx), 'y': int(cy), 'capital': sum(map(framed, profiles)) >= 3,
                    'island': island, 'coastal': coastal})

markers.sort(key=lambda m: (m['island'], m['y'], m['x']))
with open(f'{out}/markers.json', 'w') as f:
    json.dump(markers, f, indent=1)
print(len(markers), 'markers,', sum(m['capital'] for m in markers), 'capitals,',
      len({m['island'] for m in markers}), 'land masses')

draw = ImageDraw.Draw(im)
for n, m in enumerate(markers):
    colour = (0, 60, 255) if m['capital'] else (220, 0, 0)
    draw.ellipse((m['x'] - 34, m['y'] - 34, m['x'] + 34, m['y'] + 34), outline=colour, width=7)
    draw.text((m['x'] + 38, m['y'] - 20), f"{n}{'c' if m['coastal'] else ''}", fill=colour)
im.resize((W // 2, H // 2)).save(f'{out}/markers-overlay.jpg', quality=85)
