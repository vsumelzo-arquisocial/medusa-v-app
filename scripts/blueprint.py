#!/usr/bin/env python3
"""Genera los planos de ingeniería de cada flota para la página Nave.

Uso: python3 scripts/blueprint.py [flota ...]

- Vista lateral: src/assets/ship/<flota>.jpg (fondo negro, proa a la derecha).
- Vista superior: src/assets/topdown/<flota>.webp (transparente, proa arriba) → girada con la proa a la derecha.
- Salida en src/assets/blueprint/: <flota>-side.webp y <flota>-top.webp (trazo cian sobre transparente)
  y profiles.json con la proporción y el perfil (borde superior/inferior por columna) de cada vista,
  para colocar los módulos encima del casco.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/assets/blueprint"
FLEETS = ["imperium", "chaos", "tau", "aeldari", "drukhari", "orks", "necrons", "tyranids", "daemons", "votann", "genestealer"]
CYAN = np.array([125, 225, 255], dtype=np.float32)
LONG = 900  # px del lado largo
SAMPLES = 64


def side_mask(im: Image.Image) -> np.ndarray:
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    lum = a.max(-1)
    # Fondo: casi negro o azul oscuro conectado al borde
    bg = lum < 34
    h, w = bg.shape
    seen = np.zeros_like(bg)
    stack = [(y, x) for y in (0, h - 1) for x in range(0, w, 2)] + [(y, x) for x in (0, w - 1) for y in range(0, h, 2)]
    while stack:
        y, x = stack.pop()
        if seen[y, x] or not bg[y, x]:
            continue
        seen[y, x] = True
        if y > 0: stack.append((y - 1, x))
        if y < h - 1: stack.append((y + 1, x))
        if x > 0: stack.append((y, x - 1))
        if x < w - 1: stack.append((y, x + 1))
    m = Image.fromarray((~seen * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    # Quitar estelas de motor y estrellas sueltas: componente mayor aproximado por apertura
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(m) > 127


def largest_component(mask: np.ndarray) -> np.ndarray:
    try:
        from scipy import ndimage
    except ImportError:
        return mask
    lab, n = ndimage.label(mask)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.04]
    return np.isin(lab, keep)


def crop_scale(rgb: np.ndarray, mask: np.ndarray):
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, mask = rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    s = LONG / max(rgb.shape[:2])
    size = (max(1, round(rgb.shape[1] * s)), max(1, round(rgb.shape[0] * s)))
    rgb = np.asarray(Image.fromarray(rgb.astype(np.uint8)).resize(size, Image.LANCZOS)).astype(np.float32)
    mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize(size, Image.LANCZOS)) > 127
    return rgb, mask


def line_art(rgb: np.ndarray, mask: np.ndarray) -> Image.Image:
    lum = rgb.mean(-1)
    lum = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))).astype(np.float32)
    gx = np.zeros_like(lum); gy = np.zeros_like(lum)
    gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
    gy[1:-1, :] = lum[2:, :] - lum[:-2, :]
    mag = np.hypot(gx, gy)
    inner = np.clip((mag - 14) / 40, 0, 1) * mask
    m8 = Image.fromarray((mask * 255).astype(np.uint8))
    outline = (np.asarray(m8.filter(ImageFilter.MaxFilter(5))) > 0) & ~(np.asarray(m8.filter(ImageFilter.MinFilter(3))) > 0)
    alpha = np.maximum(inner * 170, outline * 255)
    alpha = np.maximum(alpha, mask * 22)  # relleno tenue
    out = np.zeros((*mask.shape, 4), dtype=np.uint8)
    out[..., :3] = CYAN
    out[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def profile(mask: np.ndarray):
    h, w = mask.shape
    cols = []
    for i in range(SAMPLES):
        x0, x1 = int(i * w / SAMPLES), max(int((i + 1) * w / SAMPLES), int(i * w / SAMPLES) + 1)
        ys = np.nonzero(mask[:, x0:x1].any(1))[0]
        cols.append([round(ys.min() / h, 3), round((ys.max() + 1) / h, 3)] if len(ys) else None)
    return {"aspect": round(w / h, 3), "cols": cols}


def main(fleets):
    OUT.mkdir(parents=True, exist_ok=True)
    pf = OUT / "profiles.json"
    data = json.loads(pf.read_text()) if pf.exists() else {}
    for f in fleets:
        side = Image.open(ROOT / f"src/assets/ship/{f}.jpg").convert("RGB")
        m = largest_component(side_mask(side))
        rgb, m = crop_scale(np.asarray(side).astype(np.float32), m)
        line_art(rgb, m).save(OUT / f"{f}-side.webp", "WEBP", quality=88, method=6)
        sp = profile(m)

        top = Image.open(ROOT / f"src/assets/topdown/{f}.webp").convert("RGBA").rotate(-90, expand=True)
        a = np.asarray(top).astype(np.float32)
        mt = largest_component(a[..., 3] > 60)
        rgb, mt = crop_scale(a[..., :3], mt)
        line_art(rgb, mt).save(OUT / f"{f}-top.webp", "WEBP", quality=88, method=6)
        data[f] = {"side": sp, "top": profile(mt)}
        print(f, "side", sp["aspect"], "top", data[f]["top"]["aspect"])
    pf.write_text(json.dumps(data, separators=(",", ":")))


if __name__ == "__main__":
    main(sys.argv[1:] or FLEETS)
