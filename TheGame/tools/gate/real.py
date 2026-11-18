#!/usr/bin/env python3
"""The real half of the gate (intent 0038, check 4a): how far renders are from photographs of the real thing.

Run by tools/gate.js real, which matches renders to photos and hands this a job (JSON): every image's file, and the
groups to compare ({ name, renders: [files], photos: [files] }). It writes back, for every group:

  cmmd   the CMMD of the renders against the photos (Jayasumana et al., "Rethinking FID: Towards a Better Evaluation
         Metric for Image Generation", CVPR 2024): the maximum mean discrepancy between the two sets' CLIP embeddings,
         with the paper's Gaussian kernel (sigma 10) and scale (x 1000), its embeddings CLIP ViT-L/14 at 336 px (OpenAI's
         weights, through open_clip), each unit long. Every picture gives as many square crops as its width holds
         (a 16:9 frame two, overlapping), each a sample: the whole frame is seen, not its middle alone. 0: alike.
  stats  natural-image statistics of each set (their means), and the renders' less the photos':
           lightness   the CIE L* histogram (50 bins), and the earth mover's distance between the two sets' (L* units)
           colour      the mean L*, a*, b* and chroma C*; the CIE76 difference of the two sets' mean colours
           contrast    the spread of L* over the picture (RMS), and its mean spread inside 32-pixel patches (local)
           spectrum    the slope of the power spectrum of lightness over spatial frequency, log against log (a
                       natural photograph's lies near -2: Field 1987, van der Schaaf and van Hateren 1996)
         Every picture is first brought to the same size (its short side 768 pixels), so the numbers do not follow
         the files' sizes.

Needs a Python with torch, open_clip_torch, pillow and numpy (tools/gate/README.md: a venv outside the repository).
"""
import argparse
import json
import math
import sys

import numpy as np
from PIL import Image

SIGMA, SCALE = 10.0, 1000.0  # CMMD's kernel and scale, the paper's own
SIDE = 768                   # the short side every picture is brought to for its statistics
BINS = 50


# ---- the statistics ----
def lab_of(rgb):
    """sRGB bytes (h, w, 3) to CIE L*a*b* (D65)."""
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def slope_of(L):
    """The power spectrum's slope (log power against log frequency) of a square of lightness, Hann-windowed, fitted
    between 4 and SIDE / 4 cycles across the square."""
    n = min(L.shape)
    y0, x0 = (L.shape[0] - n) // 2, (L.shape[1] - n) // 2
    sq = L[y0:y0 + n, x0:x0 + n]
    w = np.outer(np.hanning(n), np.hanning(n))
    P = np.abs(np.fft.fftshift(np.fft.fft2((sq - sq.mean()) * w))) ** 2
    yy, xx = np.indices(P.shape)
    r = np.hypot(yy - n // 2, xx - n // 2).astype(int)
    radial = np.bincount(r.ravel(), P.ravel()) / np.maximum(1, np.bincount(r.ravel()))
    f = np.arange(len(radial))
    k = (f >= 4) & (f <= n // 4) & (radial > 0)
    return float(np.polyfit(np.log(f[k]), np.log(radial[k]), 1)[0])


def stats_of(path):
    img = Image.open(path).convert('RGB')
    s = SIDE / min(img.size)
    img = img.resize((max(1, round(img.size[0] * s)), max(1, round(img.size[1] * s))), Image.LANCZOS)
    lab = lab_of(np.asarray(img))
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    hist = np.histogram(L, bins=BINS, range=(0, 100))[0].astype(np.float64)
    h, w = L.shape
    p = 32
    patches = L[: h // p * p, : w // p * p].reshape(h // p, p, w // p, p).std(axis=(1, 3))
    return {
        'hist': (hist / hist.sum()).tolist(),
        'L': float(L.mean()), 'a': float(a.mean()), 'b': float(b.mean()), 'C': float(C.mean()),
        'rms': float(L.std()), 'local': float(patches.mean()), 'slope': slope_of(L),
    }


def set_stats(rows):
    if not rows:
        return None
    out = {k: float(np.mean([r[k] for r in rows])) for k in ('L', 'a', 'b', 'C', 'rms', 'local', 'slope')}
    out['hist'] = np.mean([r['hist'] for r in rows], axis=0).tolist()
    return out


def emd(h1, h2):
    """The earth mover's distance between two histograms of L* over [0, 100] (in L* units)."""
    return float(np.abs(np.cumsum(np.asarray(h1) - np.asarray(h2))).sum() * (100 / BINS))


def compare(R, P):
    if not R or not P:
        return None
    return {
        'lightness': emd(R['hist'], P['hist']),
        'colour': float(math.dist([R['L'], R['a'], R['b']], [P['L'], P['a'], P['b']])),
        'chroma': R['C'] - P['C'], 'rms': R['rms'] - P['rms'], 'local': R['local'] - P['local'], 'slope': R['slope'] - P['slope'],
    }


# ---- CMMD ----
def embed(files, device, name='ViT-L-14-336', batch=8):
    import torch
    import open_clip
    model, _, pre = open_clip.create_model_and_transforms(name, pretrained='openai', device=device, force_quick_gelu=True)   # (OpenAI's weights were trained with QuickGELU)
    model.eval()
    crops, owner = [], []
    for i, f in enumerate(files):
        img = Image.open(f).convert('RGB')
        w, h = img.size
        n = max(1, round(w / h)) if w >= h else max(1, round(h / w))
        side = min(w, h)
        for k in range(n):   # square crops evenly across the long side, overlapping where it is not a whole number of them
            if w >= h:
                x = 0 if n == 1 else round(k * (w - side) / (n - 1)); box = (x, 0, x + side, side)
            else:
                y = 0 if n == 1 else round(k * (h - side) / (n - 1)); box = (0, y, side, y + side)
            crops.append(pre(img.crop(box)))
            owner.append(i)
    out = []
    with torch.no_grad():
        for k in range(0, len(crops), batch):
            e = model.encode_image(torch.stack(crops[k:k + batch]).to(device)).float()
            out.append(torch.nn.functional.normalize(e, dim=-1).cpu().numpy())
    return np.concatenate(out), np.array(owner)


def mmd(x, y):
    """CMMD's estimate (the paper's code: every pair, its own included), x 1000."""
    g = 1 / (2 * SIGMA ** 2)
    k = lambda a, b: np.exp(-g * (-2 * a @ b.T + (a * a).sum(1)[:, None] + (b * b).sum(1)[None, :])).mean()
    return float(SCALE * (k(x, x) + k(y, y) - 2 * k(x, y)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('job'); ap.add_argument('out')
    ap.add_argument('--device', default='cpu')
    ap.add_argument('--no-clip', action='store_true')
    ap.add_argument('--clip', default='ViT-L-14-336', help="open_clip's name of the CLIP (OpenAI's weights): CMMD's own is ViT-L-14-336; ViT-B-32 is a fifth of its size, and its numbers are not CMMD's")
    a = ap.parse_args()
    job = json.load(open(a.job))
    files = sorted({f for g in job['groups'] for f in g['renders'] + g['photos']})
    stats = {}
    for f in files:
        stats[f] = stats_of(f)
        print(f'  statistics: {f}', file=sys.stderr)
    E = {}
    if not a.no_clip:
        print(f'  CLIP {a.clip} on {a.device}: {len(files)} pictures', file=sys.stderr)
        e, owner = embed(files, a.device, a.clip)
        E = {f: e[owner == i] for i, f in enumerate(files)}
    groups = []
    for g in job['groups']:
        R, P = set_stats([stats[f] for f in g['renders']]), set_stats([stats[f] for f in g['photos']])
        c = None
        if E and g['renders'] and g['photos']:
            c = mmd(np.concatenate([E[f] for f in g['renders']]), np.concatenate([E[f] for f in g['photos']]))
        groups.append({'name': g['name'], 'renders': len(g['renders']), 'photos': len(g['photos']), 'cmmd': c,
                       'stats': {'renders': R and {k: v for k, v in R.items() if k != 'hist'}, 'photos': P and {k: v for k, v in P.items() if k != 'hist'}, 'diff': compare(R, P)}})
    json.dump({'groups': groups, 'images': {f: {k: v for k, v in s.items() if k != 'hist'} for f, s in stats.items()}}, open(a.out, 'w'), indent=1)


if __name__ == '__main__':
    main()
