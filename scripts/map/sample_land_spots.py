"""Samples a grid of land spots off the Altaeus world map, for the domain territories and POIs.

Usage: python3 -I scripts/map/sample_land_spots.py "assets/world maps/altaeus map.jpg" \
         data/claude/settlements.json <out-dir>
Needs Python 3 with Pillow, numpy and scipy (not part of pnpm test). Writes
<out-dir>/land-spots.json (the content envelope, source "claude") and <out-dir>/spots-overlay.jpg
(half size; spots coloured by island, in-between spots ringed in black, removed spots as black
crosses, settlements as squares) for a hand check. Put <out-dir> in a scratch folder, then copy
the reviewed JSON into data/claude/.

The land mask is detect_markers.py's: warm pixels (red well above blue), closed, holes filled and
opened. Large unfilled holes are lakes and count as water. A grid point is kept when it is on land
and at least MIN_SHORE_PX from water. Each land mass takes the island of the settlements on it; a
land mass without a settlement (an islet, the legend) is dropped. IMPASSABLE lists the spots taken
out by hand: the great crystal spires. Settlements hemmed in by neighbours or the coast get
in-between points until each is the nearest settlement to MIN_OWNED spots, where the land allows.
"""
import json
import sys
from collections import Counter

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SPACING = 100  # px between grid points, about 21 km at 4.84 px/km
MIN_SHORE_PX = 15  # a spot keeps at least this far from the sea and from lakes
LAKE_MIN_AREA = 40  # quarter-size px; smaller holes are rivers and specks of ink
Q = 4  # the land mask is worked out at 1/Q size
MIN_OWNED = 3  # spots each settlement should be nearest to, where the land allows

# Impassable ground, as (x, y, radius) in map pixels: spots inside are removed.
IMPASSABLE = [
    (520, 390, 120),  # the crystal spire in the middle of Caerdydd
    (1830, 840, 110),  # the crystal spire above Falholt
    (860, 2030, 90),  # the crystal spire in the Barren Expanse
    (3500, 1180, 110),  # the crystal spire in the Olsari crater
]

src, settlements_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
W, H = im.size

small = np.asarray(im.resize((W // Q, H // Q), Image.BILINEAR)).astype(int)
warm = small[..., 0] - small[..., 2] > 22
closed = ndi.binary_closing(warm, np.ones((5, 5)))
land = ndi.binary_opening(ndi.binary_fill_holes(closed), np.ones((3, 3)))
holes, _ = ndi.label(land & ~closed)
sizes = np.bincount(holes.ravel())
lakes = (holes > 0) & (sizes[holes] >= LAKE_MIN_AREA)
dry = land & ~lakes
shore = ndi.distance_transform_edt(dry) * Q  # full-size px to the nearest water
masses, _ = ndi.label(land)

with open(settlements_path) as f:
    settlements = json.load(f)['entries']


def mass_at(x, y, reach=6):
    """The land mass at a map point, or the commonest one within `reach` quarter px."""
    sx, sy = int(x) // Q, int(y) // Q
    near = masses[max(0, sy - reach):sy + reach + 1, max(0, sx - reach):sx + reach + 1]
    return int(np.bincount(near[near > 0]).argmax()) if (near > 0).any() else 0


votes = {}
for s in settlements:
    m = mass_at(s['at']['x'], s['at']['y'])
    if m == 0:
        sys.exit(f"settlement {s['id']} is not on any land mass")
    votes.setdefault(m, Counter())[s['island']] += 1
island_of = {}
for m, count in votes.items():
    if len(count) > 1:
        print(f'warning: land mass {m} holds settlements of {dict(count)}; using the commonest')
    island_of[m] = count.most_common(1)[0][0]

removed = []


def island_at(x, y):
    """The island of a usable spot here, or None: off water, the shore and impassable ground."""
    sx, sy = x // Q, y // Q
    if not dry[sy, sx] or shore[sy, sx] < MIN_SHORE_PX:
        return None
    m = int(masses[sy, sx])
    if m not in island_of:
        return None
    if any((x - cx) ** 2 + (y - cy) ** 2 <= r * r for cx, cy, r in IMPASSABLE):
        removed.append((x, y))
        return None
    return island_of[m]


kept = []
for y in range(SPACING // 2, H, SPACING):
    for x in range(SPACING // 2, W, SPACING):
        island = island_at(x, y)
        if island:
            kept.append({'at': {'x': x, 'y': y}, 'island': island})


def nearest_settlement(x, y, island):
    """The settlement on the same island closest in a straight line (lower id on a tie)."""
    return min((s for s in settlements if s['island'] == island),
               key=lambda s: ((s['at']['x'] - x) ** 2 + (s['at']['y'] - y) ** 2, s['id']))['id']


# A settlement hemmed in by its neighbours or the coast gets in-between points (on a grid offset
# by half the spacing, never closer than half the spacing to another spot) until it is nearest to
# MIN_OWNED spots, so every domain has some land to put a POI on.
owned = Counter(nearest_settlement(s['at']['x'], s['at']['y'], s['island']) for s in kept)
filled = []
for s in sorted(settlements, key=lambda s: s['id']):
    sx, sy = s['at']['x'], s['at']['y']
    candidates = sorted(
        ((x, y) for y in range(0, H, SPACING // 2) for x in range(0, W, SPACING // 2)
         if (x - sx) ** 2 + (y - sy) ** 2 <= (2 * SPACING) ** 2),
        key=lambda p: (p[0] - sx) ** 2 + (p[1] - sy) ** 2)
    for x, y in candidates:
        if owned[s['id']] >= MIN_OWNED:
            break
        if island_at(x, y) != s['island'] or nearest_settlement(x, y, s['island']) != s['id']:
            continue
        if any((x - k['at']['x']) ** 2 + (y - k['at']['y']) ** 2 < (SPACING / 2) ** 2
               for k in kept):
            continue
        kept.append({'at': {'x': x, 'y': y}, 'island': s['island']})
        filled.append((x, y))
        owned[s['id']] += 1
removed = sorted(set(removed))
print('filled in', len(filled), 'spots;', 'short of', MIN_OWNED, ':',
      {s['id']: owned[s['id']] for s in settlements if owned[s['id']] < MIN_OWNED})

kept.sort(key=lambda s: (s['at']['y'], s['at']['x']))
entries = [{'id': f'spot-{n:04d}', **s} for n, s in enumerate(kept, start=1)]
per_island = Counter(s['island'] for s in entries)
envelope = {
    '$schema': '../_schema/landSpots.schema.json',
    'kind': 'landSpots',
    'source': 'claude',
    'notes': (
        f'A {SPACING} px (about {SPACING / 4.84:.0f} km) grid of land points sampled off the '
        'Altaeus map by scripts/map/sample_land_spots.py: points on land at least '
        f'{MIN_SHORE_PX} px from the sea and lakes, each on the island of the settlements on its '
        'land mass. Islets without a settlement are dropped, and the great crystal spires '
        '(Caerdydd, above Falholt, the Barren Expanse, the Olsari crater) are removed as '
        f'impassable. {len(filled)} in-between spots (half a step off the grid) are added near '
        f'settlements hemmed in by neighbours or the coast, so each is nearest to at least '
        f'{MIN_OWNED} where the land allows. No terrain overrides yet: every spot takes its '
        'domain\'s land biome. Counts: '
        + ', '.join(f'{k} {v}' for k, v in sorted(per_island.items()))
        + '.'
    ),
    'entries': entries,
}
with open(f'{out}/land-spots.json', 'w') as f:
    # One spot per line, as Prettier keeps it.
    head = json.dumps({k: v for k, v in envelope.items() if k != 'entries'}, indent=2,
                      ensure_ascii=False)
    rows = ',\n'.join('    ' + json.dumps(s, ensure_ascii=False, separators=(', ', ': '))
                      .replace('{"', '{ "').replace('}', ' }') for s in entries)
    f.write(head[:-2] + ',\n  "entries": [\n' + rows + '\n  ]\n}\n')
print(len(entries), 'spots,', dict(sorted(per_island.items())), '|', len(removed),
      'removed by hand')

COLOURS = [(220, 0, 0), (0, 60, 255), (0, 150, 0), (200, 0, 200), (0, 170, 170), (230, 120, 0),
           (120, 60, 0), (90, 90, 90)]
palette = {k: COLOURS[i % len(COLOURS)] for i, k in enumerate(sorted(per_island))}
draw = ImageDraw.Draw(im)
for s in entries:
    x, y = s['at']['x'], s['at']['y']
    draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=palette[s['island']])
for x, y in filled:
    draw.ellipse((x - 15, y - 15, x + 15, y + 15), outline=(0, 0, 0), width=4)
for x, y in removed:
    draw.line((x - 12, y - 12, x + 12, y + 12), fill=(0, 0, 0), width=5)
    draw.line((x - 12, y + 12, x + 12, y - 12), fill=(0, 0, 0), width=5)
for s in settlements:
    x, y = s['at']['x'], s['at']['y']
    draw.rectangle((x - 16, y - 16, x + 16, y + 16), outline=palette.get(s['island'], (0, 0, 0)),
                   width=5)
im.resize((W // 2, H // 2)).save(f'{out}/spots-overlay.jpg', quality=85)
