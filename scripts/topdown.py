#!/usr/bin/env python3
"""Prepara una foto cenital de una nave para el mapa táctico.

Uso: python3 scripts/topdown.py <foto> <flota> [--rot GRADOS]

- Quita el fondo (transparencia existente o color uniforme de las esquinas).
- Recorta a la nave y la gira para que el eje largo quede vertical (proa arriba;
  con --rot se corrige a mano: 180 si sale al revés).
- Simplifica: suaviza el ruido, sube contraste y nitidez y aclara el contorno.
- Guarda src/assets/topdown/<flota>.png (512 px de largo, fondo transparente).
"""
import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

FLEETS = {"imperium", "chaos", "tau", "aeldari", "drukhari", "orks", "necrons", "tyranids", "daemons", "votann", "genestealer"}


def remove_background(im: Image.Image, tol: int = 38) -> Image.Image:
    im = im.convert("RGBA")
    a = np.asarray(im).astype(np.int16)
    if (a[..., 3] < 250).mean() > 0.05:  # ya trae transparencia
        return im
    h, w = a.shape[:2]
    corners = np.concatenate([a[:8, :8, :3].reshape(-1, 3), a[:8, -8:, :3].reshape(-1, 3), a[-8:, :8, :3].reshape(-1, 3), a[-8:, -8:, :3].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((a[..., :3] - bg) ** 2).sum(-1))
    # Relleno desde los bordes: solo es fondo lo conectado al exterior
    mask = dist < tol
    seen = np.zeros_like(mask)
    stack = [(y, x) for y in (0, h - 1) for x in range(w)] + [(y, x) for x in (0, w - 1) for y in range(h)]
    while stack:
        y, x = stack.pop()
        if seen[y, x] or not mask[y, x]:
            continue
        seen[y, x] = True
        if y > 0: stack.append((y - 1, x))
        if y < h - 1: stack.append((y + 1, x))
        if x > 0: stack.append((y, x - 1))
        if x < w - 1: stack.append((y, x + 1))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # Borde suave
    soft = np.clip((dist - tol * 0.6) / (tol * 0.6), 0, 1) * 255
    alpha = np.where(seen, np.minimum(alpha, soft.astype(np.uint8)), alpha)
    out = np.asarray(im).copy()
    out[..., 3] = np.minimum(out[..., 3], alpha)
    return Image.fromarray(out, "RGBA")


def orient(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3] > 40
    ys, xs = np.nonzero(a)
    if len(xs) < 10:
        return im
    cx, cy = xs.mean(), ys.mean()
    cov = np.cov(np.stack([xs - cx, ys - cy]))
    vals, vecs = np.linalg.eigh(cov)
    vx, vy = vecs[:, np.argmax(vals)]
    ang = math.degrees(math.atan2(vy, vx))  # eje largo respecto a x
    return im.rotate(ang - 90 if abs(ang) > 0 else 0, expand=True, resample=Image.BICUBIC)


def simplify(im: Image.Image) -> Image.Image:
    rgb, alpha = im.convert("RGB"), im.getchannel("A")
    rgb = rgb.filter(ImageFilter.MedianFilter(3))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.25)
    rgb = ImageEnhance.Color(rgb).enhance(0.9)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=2, percent=90, threshold=3))
    out = rgb.convert("RGBA")
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.6)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("fleet")
    ap.add_argument("--rot", type=float, default=0.0, help="giro extra en grados (180 si la proa queda abajo)")
    ap.add_argument("--tol", type=int, default=38, help="tolerancia del recorte de fondo")
    ap.add_argument("--no-orient", action="store_true", help="no girar automáticamente")
    args = ap.parse_args()
    if args.fleet not in FLEETS:
        sys.exit(f"Flota desconocida: {args.fleet}. Válidas: {', '.join(sorted(FLEETS))}")
    im = remove_background(Image.open(args.photo), args.tol)
    if not args.no_orient:
        im = orient(im)
    if args.rot:
        im = im.rotate(-args.rot, expand=True, resample=Image.BICUBIC)
    bbox = im.getchannel("A").point(lambda v: 255 if v > 30 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    im = simplify(im)
    s = 512 / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    out = Path(__file__).resolve().parent.parent / "src/assets/topdown" / f"{args.fleet}.png"
    im.save(out, optimize=True)
    print(f"{out} · {im.width}×{im.height}")


if __name__ == "__main__":
    main()
