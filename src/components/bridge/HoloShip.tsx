import { useEffect, useState } from "react";

export type HoloShipState = "orbita" | "contacto" | "combate" | "warp" | "reparando";

const cache = new Map<string, string>();

/** Ilustración de la nave → máscara de holograma (blanco con alfa por luminancia y bordes realzados). */
function useHoloMask(src: string): string | null {
  const [url, setUrl] = useState<string | null>(() => cache.get(src) ?? null);
  useEffect(() => {
    if (cache.has(src)) {
      setUrl(cache.get(src)!);
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const w = 240;
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      if (!g) return;
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h);
      const px = d.data;
      const lum = new Float32Array(w * h);
      for (let i = 0; i < lum.length; i++)
        lum[i] = (0.3 * px[i * 4]! + 0.59 * px[i * 4 + 1]! + 0.11 * px[i * 4 + 2]!) / 255;
      // Luminancia normalizada (percentil 97) para conservar el detalle en naves claras
      const sorted = Array.from(lum)
        .filter((v) => v > 0.06)
        .sort((x, y) => x - y);
      const top = sorted[Math.floor(sorted.length * 0.97)] ?? 1;
      for (let i = 0; i < lum.length; i++) {
        const l = Math.min(1, lum[i]! / top);
        const e = i > w ? Math.abs(l - lum[i - 1]!) + Math.abs(l - lum[i - w]!) : 0;
        const a =
          (lum[i]! < 0.06 ? 0 : Math.max(0, Math.min(1, 0.12 + Math.pow(l, 1.7) * 0.8 + e * 1.8))) *
          (px[i * 4 + 3]! / 255);
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
        px[i * 4 + 3] = a * 255;
      }
      g.putImageData(d, 0, 0);
      const out = c.toDataURL("image/png");
      cache.set(src, out);
      if (alive) setUrl(out);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return url;
}

const TAG: Record<HoloShipState, string> = {
  orbita: "En órbita",
  contacto: "Contacto hostil",
  combate: "En combate",
  warp: "Protección warp",
  reparando: "Reparando",
};

/**
 * Holograma pequeño de la nave en órbita: proyección con barrido, parpadeo y motor,
 * tinte según el estado (combate en rojo, warp en violeta…) y barra de casco.
 */
export function HoloShip({
  image,
  name,
  hull,
  maxHull,
  state,
}: {
  image: string;
  name: string;
  hull: number | null;
  maxHull: number | null;
  state: HoloShipState;
}) {
  const mask = useHoloMask(image);
  const pct = hull !== null && maxHull ? Math.max(0, Math.min(1, hull / maxHull)) : null;
  const critical = pct !== null && pct <= 0.35;
  const tone =
    state === "combate" || state === "contacto"
      ? "orbit-holo--red"
      : state === "warp"
        ? "orbit-holo--warp"
        : critical || state === "reparando"
          ? "orbit-holo--amber"
          : "";
  const style = mask ? { WebkitMaskImage: `url(${mask})`, maskImage: `url(${mask})` } : undefined;
  return (
    <div
      className={`orbit-holo ${tone} ${critical || state === "combate" ? "orbit-holo--glitch" : ""}`}
      role="img"
      aria-label={`${name}: ${TAG[state].toLowerCase()}${pct !== null ? `, casco ${Math.round(pct * 100)} %` : ""}`}
    >
      <div className="orbit-holo__body">
        <span className="orbit-holo__engine" aria-hidden />
        {mask ? (
          <>
            <div className="orbit-holo__img orbit-holo__img--glow" style={style} aria-hidden />
            <div className="orbit-holo__img" style={style} aria-hidden />
          </>
        ) : (
          <img src={image} alt="" className="orbit-holo__fallback" />
        )}
        {state === "warp" && <span className="orbit-holo__shield" aria-hidden />}
      </div>
      <span className="orbit-holo__base" aria-hidden />
      <div className="orbit-holo__hud">
        <span className="orbit-holo__name">{name}</span>
        {pct !== null && (
          <span className="orbit-holo__hull" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} className={i < Math.ceil(pct * 10) ? "on" : ""} />
            ))}
          </span>
        )}
        <span className="orbit-holo__tag">
          {TAG[state]}
          {pct !== null && ` · ${Math.round(pct * 100)}%`}
        </span>
      </div>
    </div>
  );
}
