"""
Vectorise le logo Exprnc. (PNG) :
  - contour du sticker (fond crème)
  - lettres (noir) nettoyées des lignes de découpe blanches
  - lignes de découpe (centre des traits blancs), lissées
  - 3 pièces de puzzle = sticker découpé par les 2 lignes
Sortie : assets/logo.json (coordonnées en pixels de l'image source, origine en haut à gauche)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import splprep, splev
from skimage import measure, morphology
from shapely.geometry import Polygon, MultiPolygon
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "logo-source.png"
OUT = ROOT / "assets" / "logo.json"
UP = 4  # facteur de sur-échantillonnage pour des contours sub-pixel lisses

img = np.array(Image.open(SRC).convert("RGBA")).astype(np.float64)
H, W = img.shape[:2]
alpha = img[..., 3] / 255.0
lum = 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]

CREAM = img[300, 100, :3]
INK = img[200, 200, :3]

# --------------------------------------------------------------------------- lignes blanches
white = (img[..., 3] >= 250) & (img[..., 0] > 245) & (img[..., 1] > 245) & (img[..., 2] > 245)
lab, n = ndi.label(white, structure=np.ones((3, 3)))
sizes = ndi.sum(white, lab, range(1, n + 1))
line_ids = [i + 1 for i in np.argsort(-sizes)[:2]]
# tri gauche -> droite
line_ids.sort(key=lambda i: np.where(lab == i)[1].mean())
line_mask = ndi.binary_dilation(white, iterations=2)

# --------------------------------------------------------------------------- lettres nettoyées
dark = np.clip((CREAM.mean() - lum) / (CREAM.mean() - INK.mean()), 0, 1)
valid = (~line_mask) & (img[..., 3] >= 250)
wgt = valid.astype(np.float64)
sig = 3.0
num = ndi.gaussian_filter(dark * wgt, sig)
den = ndi.gaussian_filter(wgt, sig)
filled = np.where(den > 1e-6, num / np.maximum(den, 1e-6), 0)
dark_clean = np.where(valid, dark, filled)
dark_clean[img[..., 3] < 250] = 0.0


def upsample(field, s=UP):
    h, w = field.shape
    yy = (np.arange(h * s) + 0.5) / s - 0.5
    xx = (np.arange(w * s) + 0.5) / s - 0.5
    Y, X = np.meshgrid(yy, xx, indexing="ij")
    return ndi.map_coordinates(field, [Y, X], order=3, mode="nearest")


def contours(field, level, tol):
    up = ndi.gaussian_filter(upsample(field), 0.8)
    cs = measure.find_contours(up, level)
    out = []
    for c in cs:
        # (row, col) sur-échantillonné -> coordonnées "canvas" (bord de pixel)
        y = (c[:, 0] + 0.5) / UP
        x = (c[:, 1] + 0.5) / UP
        pts = np.stack([x, y], 1)
        pts = measure.approximate_polygon(pts, tolerance=tol)
        if len(pts) >= 4 and Polygon(pts).area > 4:
            out.append(pts)
    return out


letters = contours(dark_clean, 0.5, 0.06)
sticker_rings = contours(alpha, 0.5, 0.06)
sticker_rings.sort(key=lambda p: -Polygon(p).area)
sticker = Polygon(sticker_rings[0]).buffer(0)
print(f"lettres: {len(letters)} contours, sticker aire={sticker.area:.0f}")

# --------------------------------------------------------------------------- centre des lignes de découpe


def ordered_skeleton(mask):
    sk = morphology.skeletonize(mask)
    ys, xs = np.nonzero(sk)
    idx = {(y, x): k for k, (y, x) in enumerate(zip(ys, xs))}
    nbrs = [[] for _ in range(len(ys))]
    for k, (y, x) in enumerate(zip(ys, xs)):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if (dy or dx) and (y + dy, x + dx) in idx:
                    nbrs[k].append(idx[(y + dy, x + dx)])

    def bfs(start):
        dist = {start: 0}
        prev = {start: None}
        q = [start]
        for u in q:
            for v in nbrs[u]:
                if v not in dist:
                    dist[v] = dist[u] + 1
                    prev[v] = u
                    q.append(v)
        return dist, prev

    top = int(np.argmin(ys))
    d1, _ = bfs(top)
    far = max(d1, key=d1.get)
    d2, prev = bfs(far)
    far2 = max(d2, key=d2.get)
    path = []
    u = far2
    while u is not None:
        path.append(u)
        u = prev[u]
    pts = np.array([[xs[k] + 0.5, ys[k] + 0.5] for k in path], dtype=np.float64)
    if pts[0, 1] > pts[-1, 1]:
        pts = pts[::-1]
    return pts


def smooth_line(pts, step=0.75, extend=60.0):
    tck, u = splprep([pts[:, 0], pts[:, 1]], s=len(pts) * 0.35, k=3)
    # longueur approx
    uu = np.linspace(0, 1, 4000)
    x, y = splev(uu, tck)
    seg = np.hypot(np.diff(x), np.diff(y))
    L = seg.sum()
    cum = np.concatenate([[0], np.cumsum(seg)])
    m = int(L / step)
    target = np.linspace(0, L, m)
    us = np.interp(target, cum, uu)
    x, y = splev(us, tck)
    line = np.stack([x, y], 1)
    # prolongement tangent aux extrémités (pour traverser complètement le sticker)
    t0 = line[0] - line[4]
    t0 /= np.linalg.norm(t0)
    t1 = line[-1] - line[-5]
    t1 /= np.linalg.norm(t1)
    head = [line[0] + t0 * d for d in np.arange(extend, 0, -step * 4)]
    tail = [line[-1] + t1 * d for d in np.arange(step * 4, extend + 1e-6, step * 4)]
    return np.vstack([head, line, tail]), L


cuts = []
widths = []
for lid in line_ids:
    m = lab == lid
    pts = ordered_skeleton(m)
    line, L = smooth_line(pts)
    cuts.append(line)
    widths.append(m.sum() / L)
line_width = float(np.mean(widths))
print(f"largeur moyenne des traits blancs: {line_width:.2f}px")


def fit_circle(P):
    x, y = P[:, 0], P[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x**2 + y**2
    c, *_ = np.linalg.lstsq(A, b, rcond=None)
    cx, cy = c[0], c[1]
    return float(cx), float(cy), float(np.sqrt(c[2] + cx**2 + cy**2))


knobs = []
for i, line in enumerate(cuts):
    medx = np.median(line[:, 0])
    sel = line[line[:, 0] > medx + 25] if i == 0 else line[line[:, 0] < medx - 25]
    knobs.append([round(v, 3) for v in fit_circle(sel)])
print("tenons (cx, cy, r):", knobs)

# --------------------------------------------------------------------------- pièces


def left_region(line):
    # la ligne est prolongée verticalement à l'infini aux deux bouts, pour que la
    # région couvre toute la hauteur (sinon le bas du sticker sous le « p » était perdu)
    far = 10000.0
    ring = np.vstack([[[line[0, 0], -far]], line, [[line[-1, 0], far], [-far, far], [-far, -far]]])
    p = Polygon(ring)
    if not p.is_valid:
        p = make_valid(p)
    return p


L1 = left_region(cuts[0])
L2 = left_region(cuts[1])
p1 = sticker.intersection(L1)
p2 = sticker.difference(L1).intersection(L2)
p3 = sticker.difference(L2)


def biggest(g):
    if isinstance(g, MultiPolygon) or g.geom_type == "GeometryCollection":
        polys = [q for q in g.geoms if q.geom_type == "Polygon"]
        polys.sort(key=lambda q: -q.area)
        return polys[0]
    return g


pieces = []
GAP = 0.35  # demi-jeu entre pièces (px source)
for p in (p1, p2, p3):
    p = biggest(p).buffer(-GAP, join_style=1).buffer(0)
    p = biggest(p).simplify(0.05, preserve_topology=True)
    ext = np.array(p.exterior.coords)[:-1]
    c = p.centroid
    pieces.append(
        {
            "outline": np.round(ext, 3).tolist(),
            "centroid": [round(c.x, 3), round(c.y, 3)],
            "bbox": [round(v, 3) for v in p.bounds],
            "area": round(p.area, 1),
        }
    )
    print(f"pièce: {len(ext)} pts, aire={p.area:.0f}, bbox={tuple(round(v) for v in p.bounds)}")

from shapely.geometry import LineString

cuts_inside = []
for line in cuts:
    g = LineString(line).intersection(sticker)
    if g.geom_type == "MultiLineString":
        g = max(g.geoms, key=lambda s: s.length)
    cuts_inside.append(np.round(np.array(g.coords), 3).tolist())

sb = sticker.bounds
data = {
    "width": W,
    "height": H,
    "stickerBBox": [round(v, 3) for v in sb],
    "knobs": knobs,
    "cutsInside": cuts_inside,
    "colors": {
        "cream": "#%02x%02x%02x" % tuple(int(v) for v in CREAM),
        "ink": "#%02x%02x%02x" % tuple(int(v) for v in INK),
    },
    "lineWidth": round(line_width, 3),
    "sticker": np.round(np.array(sticker.exterior.coords)[:-1], 3).tolist(),
    "letters": [np.round(c, 3).tolist() for c in letters],
    "cuts": [np.round(c, 3).tolist() for c in cuts],
    "pieces": pieces,
}
OUT.write_text(json.dumps(data, separators=(",", ":")))
print("écrit", OUT, f"{OUT.stat().st_size/1024:.0f} Ko")

# --------------------------------------------------------------------------- aperçu de contrôle
if "--preview" in sys.argv:
    from PIL import ImageDraw

    S = 2
    im = Image.new("RGB", (W * S, H * S), (40, 40, 40))
    dr = ImageDraw.Draw(im)
    cols = [(230, 120, 90), (110, 190, 140), (100, 150, 230)]
    for pc, col in zip(pieces, cols):
        dr.polygon([(x * S, y * S) for x, y in pc["outline"]], fill=col)
    # lettres en noir (even-odd approx : on dessine les contours)
    mask = Image.new("L", (W * S, H * S), 0)
    md = ImageDraw.Draw(mask)
    for c in letters:
        md.polygon([(x * S, y * S) for x, y in c], fill=255, outline=None)
    # even-odd : XOR des polygones
    acc = np.zeros((H * S, W * S), bool)
    for c in letters:
        mm = Image.new("1", (W * S, H * S), 0)
        ImageDraw.Draw(mm).polygon([(x * S, y * S) for x, y in c], fill=1)
        acc ^= np.array(mm)
    arr = np.array(im)
    arr[acc] = (arr[acc] * 0.25).astype(np.uint8)
    im = Image.fromarray(arr)
    dr = ImageDraw.Draw(im)
    for cut in cuts:
        dr.line([(x * S, y * S) for x, y in cut], fill=(255, 255, 255), width=2)
    im.save(sys.argv[sys.argv.index("--preview") + 1])
    print("aperçu écrit")
