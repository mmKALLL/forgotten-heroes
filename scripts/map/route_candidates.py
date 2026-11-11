"""Proposes routes between settlements, for a hand review against the map's dashed roads.

Usage: python3 -I scripts/map/route_candidates.py "assets/world maps/altaeus map.jpg" \
         data/claude/settlements.json <out-dir> [data/claude/routes.json]
Writes <out-dir>/candidates.json and <out-dir>/candidates-overlay.jpg: each settlement's 4 nearest
neighbours, numbered (green = the straight line stays on land, blue = it crosses water). With a
routes file it draws those routes instead (<out-dir>/routes-overlay.jpg), to check the result.
Needs Python 3 with Pillow and numpy.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw

PX_PER_KM = 4.84
NEAREST = 4

src, settlements_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
routes_path = sys.argv[4] if len(sys.argv) > 4 else None
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
warm = a[..., 0] - a[..., 2] > 22  # land; the sea is grey
with open(settlements_path) as f:
    sites = json.load(f)['entries']
at = {s['id']: (s['at']['x'], s['at']['y']) for s in sites}


def land_fraction(p, q, steps=200):
    xs = np.linspace(p[0], q[0], steps).astype(int)
    ys = np.linspace(p[1], q[1], steps).astype(int)
    return float(warm[ys, xs].mean())


draw = ImageDraw.Draw(im)
if routes_path:
    with open(routes_path) as f:
        routes = json.load(f)['entries']
    for route in routes:
        p, q = at[route['from']], at[route['to']]
        colour = (0, 80, 255) if route['terrain'] == 'sea' else (0, 150, 0)
        draw.line((*p, *q), fill=colour, width=6)
        draw.text(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), f"{route['km']} d{route['danger']}",
                  fill=(200, 0, 0))
    im.resize((im.width // 2, im.height // 2)).save(f'{out}/routes-overlay.jpg', quality=85)
    sys.exit(0)

pairs = set()
for s in sites:
    others = sorted((t for t in sites if t['id'] != s['id']),
                    key=lambda t: math.dist(at[s['id']], at[t['id']]))
    for t in others[:NEAREST]:
        pairs.add(tuple(sorted((s['id'], t['id']))))

candidates = []
for n, (u, v) in enumerate(sorted(pairs)):
    straight = math.dist(at[u], at[v]) / PX_PER_KM
    candidates.append({'n': n, 'from': u, 'to': v, 'straightKm': round(straight, 1),
                       'land': round(land_fraction(at[u], at[v]), 2)})
    colour = (0, 150, 0) if candidates[-1]['land'] > 0.9 else (0, 80, 255)
    draw.line((*at[u], *at[v]), fill=colour, width=5)
    draw.text(((at[u][0] + at[v][0]) / 2, (at[u][1] + at[v][1]) / 2), str(n), fill=(200, 0, 0))
with open(f'{out}/candidates.json', 'w') as f:
    json.dump(candidates, f, indent=1)
im.resize((im.width // 2, im.height // 2)).save(f'{out}/candidates-overlay.jpg', quality=85)
print(len(candidates), 'candidates')
