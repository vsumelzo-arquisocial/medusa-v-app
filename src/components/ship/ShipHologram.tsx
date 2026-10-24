import { useEffect, useRef } from "react";
import { bodyName } from "@/lib/system";
import { BODY_TEXTURES } from "@/lib/system-art";
import { SHIP_RIGS } from "@/components/ship/ship-scene-config";
import type { FleetId } from "@/lib/ship-identity";

export type ShipTravelState = "warp" | "return" | null;

export interface ShipSceneProps {
  image: string;
  name: string;
  hull: number;
  maxHull: number;
  fleet: FleetId;
  /** Aproximación de una ofensiva (motores encendidos, estrellas en movimiento). */
  moving?: boolean;
  /** Protección warp tras un combate (campo protector). */
  warp?: boolean;
  damagedModules?: number;
  /** Cuerpo celeste orbitado; null si está en el warp. */
  orbitBody?: string | null;
  /** Viaje por el sistema: ida o regreso tras anular. */
  travel?: ShipTravelState;
  /** Duelo naval activo contra otra nave. */
  combat?: { enemyImage: string; enemyName: string } | null;
  /** Reparación de casco en curso. */
  repairing?: boolean;
  /** Nivel de la cámara de escudos (0-3): intensidad de la burbuja. */
  shieldLevel?: number;
}

const W = 1200;
const H = 650;
const CX = W / 2;
const CY = 300;
/** Radio del planeta holográfico y del lienzo donde se calcula la esfera (más pequeño = más rápido). */
const PR = 150;
const SR = 120;
/** Órbita: elipse inclinada (semiejes en píxeles). */
const OA = 400;
const OB = 92;
const TILT = -0.12;

type RGB = [number, number, number];
const HOLO: RGB = [110, 230, 255];
const FOE: RGB = [255, 110, 90];

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  return img;
}

const ready = (img: HTMLImageElement | null): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/** Convierte la ilustración de la nave en un holograma: luminancia → color, fondo negro → transparente. */
function holoSprite(img: HTMLImageElement, tint: RGB, width: number): HTMLCanvasElement {
  const h = Math.round((width * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, width, h);
  const d = g.getImageData(0, 0, width, h);
  const px = d.data;
  // Bordes: detalle = diferencia con el píxel vecino (realza el contorno como un escaneo)
  const lum = new Float32Array(width * h);
  for (let i = 0; i < lum.length; i++)
    lum[i] = (0.3 * px[i * 4]! + 0.59 * px[i * 4 + 1]! + 0.11 * px[i * 4 + 2]!) / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const l = lum[i]!;
      const e = x > 0 && y > 0 ? Math.abs(l - lum[i - 1]!) + Math.abs(l - lum[i - width]!) : 0;
      const a = Math.max(0, Math.min(0.85, (l - 0.07) * 1.3 + e * 2.5));
      const v = Math.min(1, 0.25 + l * 0.6 + e * 2.2);
      const hot = Math.max(0, e * 3 - 0.5) * 120;
      px[i * 4] = Math.min(255, tint[0] * v + hot);
      px[i * 4 + 1] = Math.min(255, tint[1] * v + hot);
      px[i * 4 + 2] = Math.min(255, tint[2] * v + hot);
      px[i * 4 + 3] = a * 255;
    }
  g.putImageData(d, 0, 0);
  return c;
}

/** Textura equirectangular del planeta → luminancia en una cuadrícula pequeña. */
function planetLum(img: HTMLImageElement): { w: number; h: number; lum: Float32Array } {
  const w = 512;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  let max = 0.01;
  for (let i = 0; i < lum.length; i++) {
    lum[i] = 0.3 * px[i * 4]! + 0.59 * px[i * 4 + 1]! + 0.11 * px[i * 4 + 2]!;
    max = Math.max(max, lum[i]!);
  }
  let min = 1e9;
  for (let i = 0; i < lum.length; i++) min = Math.min(min, lum[i]!);
  for (let i = 0; i < lum.length; i++)
    lum[i] = Math.pow((lum[i]! - min) / Math.max(1, max - min), 1.3);
  return { w, h, lum };
}

/**
 * Proyección holográfica del puente: el planeta orbitado gira como un globo de luz y la nave,
 * convertida en holograma, describe su órbita alrededor (pasa por delante y por detrás).
 * Mismo contrato que la vista exterior: casco, daños, reparación, escudos, viaje, warp y combate.
 */
export function ShipHologram(props: ShipSceneProps) {
  const {
    image,
    name,
    hull,
    maxHull,
    fleet,
    moving = false,
    warp = false,
    damagedModules = 0,
    orbitBody = null,
    travel = null,
    combat = null,
    repairing = false,
    shieldLevel = 1,
  } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const damage = Math.max(0, Math.min(1, 1 - hull / Math.max(1, maxHull)));

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = W;
    c.height = H;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const rig = SHIP_RIGS[fleet];
    const shipImg = loadImage(image);
    const enemyImg = combat ? loadImage(combat.enemyImage) : null;
    const tex = orbitBody && BODY_TEXTURES[orbitBody] ? loadImage(BODY_TEXTURES[orbitBody]) : null;
    let ship: HTMLCanvasElement | null = null;
    let enemy: HTMLCanvasElement | null = null;
    let planet: ReturnType<typeof planetLum> | null = null;

    // Esfera: tabla de latitud/longitud por píxel (se calcula una vez)
    const size = SR * 2;
    const sphere = document.createElement("canvas");
    sphere.width = size;
    sphere.height = size;
    const sg = sphere.getContext("2d")!;
    const sImg = sg.createImageData(size, size);
    const lut: { i: number; lat: number; lon: number; rim: number; light: number }[] = [];
    const L = { x: -0.55, y: -0.45, z: 0.7 };
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const nx = (x - SR + 0.5) / SR;
        const ny = (y - SR + 0.5) / SR;
        const r2 = nx * nx + ny * ny;
        if (r2 > 1) continue;
        const nz = Math.sqrt(1 - r2);
        // Eje inclinado unos grados
        const ty = ny * Math.cos(0.35) - nz * Math.sin(0.35);
        const tz = ny * Math.sin(0.35) + nz * Math.cos(0.35);
        lut.push({
          i: (y * size + x) * 4,
          lat: Math.asin(Math.max(-1, Math.min(1, -ty))),
          lon: Math.atan2(nx, tz),
          rim: Math.pow(1 - nz, 2.2),
          light: Math.max(0, nx * L.x + ny * L.y + nz * L.z),
        });
      }

    const renderSphere = (rot: number, glitch: number) => {
      const d = sImg.data;
      const p = planet;
      for (const q of lut) {
        let lon = q.lon + rot;
        lon -= Math.floor(lon / (2 * Math.PI)) * 2 * Math.PI;
        const u = lon / (2 * Math.PI);
        const v = 0.5 - q.lat / Math.PI;
        const lum = p
          ? p.lum[
              Math.min(p.h - 1, Math.floor(v * p.h)) * p.w + Math.min(p.w - 1, Math.floor(u * p.w))
            ]!
          : 0.4;
        // Retícula de latitud/longitud
        const gl = Math.abs(((q.lat * 180) / Math.PI / 20) % 1);
        const gn = Math.abs(((lon * 180) / Math.PI / 20) % 1);
        const grid = Math.max(
          gl < 0.03 || gl > 0.97 ? 0.35 : 0,
          gn < 0.025 || gn > 0.975 ? 0.25 : 0,
        );
        const shade = 0.25 + 0.75 * q.light;
        const val = Math.min(1.15, 0.06 + lum * shade * 0.95 + q.rim * 0.9 + grid * 0.45);
        const hot = Math.max(0, val - 1) * 200;
        d[q.i] = Math.min(255, HOLO[0] * val + hot);
        d[q.i + 1] = Math.min(255, HOLO[1] * val + hot);
        d[q.i + 2] = Math.min(255, HOLO[2] * val + hot);
        d[q.i + 3] = Math.min(255, (0.18 + val * 0.75) * 255 * (1 - glitch * 0.4));
      }
      sg.putImageData(sImg, 0, 0);
    };

    // Polvo de luz flotando en el cono del proyector
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const motes = Array.from({ length: 70 }, () => ({
      x: CX + (rnd() - 0.5) * 700,
      y: 80 + rnd() * 520,
      s: 0.6 + rnd() * 1.6,
      v: 4 + rnd() * 10,
      a: 0.15 + rnd() * 0.4,
    }));
    const trail: { x: number; y: number; z: number }[] = [];
    let glitchT = 0;
    let glitchY = 0;
    let shotT = 2;

    const drawProjector = (t: number) => {
      // Mesa proyectora
      const by = H - 40;
      const disc = ctx.createRadialGradient(CX, by, 10, CX, by, 300);
      disc.addColorStop(0, rgba(HOLO, 0.55));
      disc.addColorStop(0.25, rgba(HOLO, 0.18));
      disc.addColorStop(1, rgba(HOLO, 0));
      ctx.save();
      ctx.translate(CX, by);
      ctx.scale(1, 0.18);
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(0, 0, 300, 0, Math.PI * 2);
      ctx.translate(-CX, -by);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba(HOLO, 0.5);
      ctx.lineWidth = 1.5;
      for (const [r, a] of [
        [250, 0.5],
        [190, 0.3],
        [120, 0.6],
      ] as const) {
        ctx.globalAlpha = a * (0.8 + 0.2 * Math.sin(t * 3 + r));
        ctx.beginPath();
        ctx.ellipse(CX, by, r, r * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Cono de luz
      const cone = ctx.createLinearGradient(0, by, 0, 40);
      cone.addColorStop(0, rgba(HOLO, 0.16));
      cone.addColorStop(0.6, rgba(HOLO, 0.04));
      cone.addColorStop(1, rgba(HOLO, 0));
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(CX - 240, by);
      ctx.lineTo(CX - 520, 40);
      ctx.lineTo(CX + 520, 40);
      ctx.lineTo(CX + 240, by);
      ctx.closePath();
      ctx.fill();
    };

    const orbitPoint = (a: number, ra = OA, rb = OB, tilt = TILT) => {
      const x = Math.cos(a) * ra;
      const y = Math.sin(a) * rb;
      return {
        x: CX + x * Math.cos(tilt) - y * Math.sin(tilt),
        y: CY + x * Math.sin(tilt) + y * Math.cos(tilt),
        z: Math.sin(a),
      };
    };

    const drawOrbit = (front: boolean, ra = OA, rb = OB, tilt = TILT, col = HOLO) => {
      ctx.strokeStyle = rgba(col, front ? 0.45 : 0.18);
      ctx.lineWidth = front ? 1.4 : 1;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const a = front ? (k / 60) * Math.PI : Math.PI + (k / 60) * Math.PI;
        const p = orbitPoint(a, ra, rb, tilt);
        if (k === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    /** Nave holográfica en su punto de órbita: escala por profundidad y giro de perfil al cruzar los lados. */
    const drawShip = (
      spr: HTMLCanvasElement,
      a: number,
      t: number,
      opts: { ra?: number; rb?: number; tilt?: number; width: number; col: RGB; mine: boolean },
    ) => {
      const p = orbitPoint(a, opts.ra, opts.rb, opts.tilt);
      const depth = 0.72 + 0.28 * (p.z + 1) * 0.5 + (p.z > 0 ? 0.12 : 0);
      const dir = -Math.sin(a); // avance en x: + derecha
      const face = Math.sign(dir) || 1;
      const sx = face * Math.max(0.18, Math.abs(dir));
      const w = opts.width * depth;
      const h = (w * spr.height) / spr.width;
      const bob = Math.sin(t * 1.3 + a) * 3;
      const flick = 0.85 + 0.15 * Math.sin(t * 37 + a * 5) * Math.sin(t * 13);
      ctx.save();
      ctx.translate(p.x, p.y - h * 0.15 + bob);
      ctx.rotate(Math.cos(a) * 0.05 + (opts.tilt ?? TILT) * face * 0.6);
      ctx.scale(sx, 1);
      ctx.globalCompositeOperation = "lighter";
      const alpha = (p.z < 0 ? 0.4 : 0.9) * flick;
      // Por delante: recorta lo que hay detrás para que la nave se separe del planeta
      if (p.z >= 0) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 0.75;
        ctx.filter = "blur(3px)";
        ctx.drawImage(spr, -w / 2, -h / 2, w, h);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "lighter";
      }
      // Halo difuso + nave nítida
      ctx.globalAlpha = alpha * 0.45;
      ctx.filter = "blur(7px)";
      ctx.drawImage(spr, -w / 2, -h / 2, w, h);
      ctx.filter = "none";
      ctx.globalAlpha = alpha;
      ctx.drawImage(spr, -w / 2, -h / 2, w, h);
      // Motores
      const enginesOn = opts.mine ? moving || !!travel || !!combat : true;
      for (const [ex, ey] of rig.engines.length && opts.mine ? rig.engines : [[0.04, 0.5]]) {
        const x = -w / 2 + ex! * w;
        const y = -h / 2 + ey! * h;
        const len = (enginesOn ? 60 : 22) * depth * (0.85 + 0.15 * Math.sin(t * 20 + ey! * 9));
        const g = ctx.createLinearGradient(x, y, x - len, y);
        g.addColorStop(0, rgba([255, 255, 255], 0.9));
        g.addColorStop(0.2, rgba(opts.col, 0.7));
        g.addColorStop(1, rgba(opts.col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x - len / 2, y, len / 2, 4 * depth, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Daños: chispas rojas parpadeantes / reparación: destellos dorados
      if (opts.mine && (damage > 0.05 || damagedModules > 0 || repairing)) {
        const n = Math.min(rig.hot.length, Math.ceil(damage * 5) + damagedModules);
        rig.hot.slice(0, Math.max(n, repairing ? 2 : 0)).forEach(([hx, hy], k) => {
          const on = Math.sin(t * (6 + k) + k * 2) > 0.2;
          if (!on) return;
          ctx.fillStyle = repairing && k % 2 ? "rgba(255,220,120,0.95)" : "rgba(255,80,60,0.9)";
          ctx.beginPath();
          ctx.arc(-w / 2 + hx! * w, -h / 2 + hy! * h, 2.5 + Math.random() * 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.restore();
      // Burbuja de escudos / protección warp
      if (opts.mine && (shieldLevel > 0 || warp)) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = warp
          ? "rgba(200,140,255,0.55)"
          : rgba(opts.col, 0.12 + shieldLevel * 0.06);
        ctx.lineWidth = warp ? 2 : 1;
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y - h * 0.15 + bob,
          (w / 2) * Math.max(0.35, Math.abs(sx)) + 16,
          h / 2 + 10,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();
      }
      return { x: p.x, y: p.y - h * 0.15 + bob, z: p.z };
    };

    const drawPlanet = (t: number, glitch: number) => {
      const r = PR;
      // Base oscura que tapa lo que pasa por detrás
      ctx.save();
      ctx.fillStyle = "rgba(2,8,14,0.55)";
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, Math.PI * 2);
      ctx.fill();
      if (orbitBody) {
        renderSphere(reduced ? 0.6 : t * 0.08, glitch);
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(sphere, CX - r + glitch * 6, CY - r, r * 2, r * 2);
        // Atmósfera
        const at = ctx.createRadialGradient(CX, CY, r * 0.9, CX, CY, r * 1.25);
        at.addColorStop(0, rgba(HOLO, 0.25));
        at.addColorStop(1, rgba(HOLO, 0));
        ctx.fillStyle = at;
        ctx.beginPath();
        ctx.arc(CX, CY, r * 1.25, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // En el disforme: vórtice holográfico en lugar de planeta
        ctx.globalCompositeOperation = "lighter";
        for (let k = 0; k < 9; k++) {
          ctx.strokeStyle = `rgba(200,140,255,${0.5 - k * 0.045})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const rr = r * (0.15 + k * 0.1);
          ctx.ellipse(
            CX,
            CY,
            rr,
            rr * 0.9,
            t * (0.6 + k * 0.15) * (k % 2 ? -1 : 1),
            0.3,
            Math.PI * 1.6,
          );
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const drawScan = (t: number) => {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      for (let y = (t * 30) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1.4);
      // Barrido de luz que sube
      const sy = H - ((t * 90) % (H + 200));
      const g = ctx.createLinearGradient(0, sy - 60, 0, sy + 20);
      g.addColorStop(0, rgba(HOLO, 0));
      g.addColorStop(0.75, rgba(HOLO, 0.06));
      g.addColorStop(1, rgba(HOLO, 0));
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.fillRect(0, sy - 60, W, 80);
      ctx.restore();
    };

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(c);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible) {
        t += reduced ? 0 : dt;
        if (!ship && ready(shipImg)) ship = holoSprite(shipImg, HOLO, 300);
        if (!enemy && ready(enemyImg)) enemy = holoSprite(enemyImg, FOE, 260);
        if (!planet && ready(tex)) planet = planetLum(tex);
        // Fallos de proyección: más frecuentes con el casco dañado
        glitchT -= dt;
        if (glitchT <= 0 && Math.random() < dt * (0.15 + damage * 1.6)) {
          glitchT = 0.08 + Math.random() * 0.12;
          glitchY = Math.random() * H;
        }
        const glitch = glitchT > 0 ? 1 : 0;

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        const bg = ctx.createRadialGradient(CX, CY + 60, 50, CX, CY, 760);
        bg.addColorStop(0, "#071820");
        bg.addColorStop(1, "#010407");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        drawProjector(t);

        const speed = travel ? 0.55 : moving || combat ? 0.3 : 0.16;
        const a = -Math.PI * 0.15 + t * speed;
        const aE = Math.PI * 1.2 - t * 0.22;
        const ownP = orbitPoint(a);
        trail.push(ownP);
        if (trail.length > 50) trail.shift();
        const back = (z: number) => z < 0;

        // Detrás del planeta
        drawOrbit(false);
        if (combat) drawOrbit(false, 330, 150, 0.35, FOE);
        const drawTrail = (front: boolean) => {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          for (let k = 1; k < trail.length; k++) {
            const p0 = trail[k - 1]!;
            const p1 = trail[k]!;
            if (back(p1.z) === front) continue;
            ctx.strokeStyle = rgba(HOLO, (k / trail.length) * (front ? 0.5 : 0.2));
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
          ctx.restore();
        };
        drawTrail(false);
        let own = { x: ownP.x, y: ownP.y, z: ownP.z };
        let foe: { x: number; y: number; z: number } | null = null;
        const enemyAt = combat ? orbitPoint(aE, 330, 150, 0.35) : null;
        if (enemy && enemyAt && back(enemyAt.z))
          foe = drawShip(enemy, aE, t, {
            ra: 330,
            rb: 150,
            tilt: 0.35,
            width: 180,
            col: FOE,
            mine: false,
          });
        if (ship && back(ownP.z)) own = drawShip(ship, a, t, { width: 230, col: HOLO, mine: true });
        drawPlanet(t, glitch);
        // Delante
        drawOrbit(true);
        if (combat) drawOrbit(true, 330, 150, 0.35, FOE);
        drawTrail(true);
        if (enemy && enemyAt && !back(enemyAt.z))
          foe = drawShip(enemy, aE, t, {
            ra: 330,
            rb: 150,
            tilt: 0.35,
            width: 180,
            col: FOE,
            mine: false,
          });
        if (ship && !back(ownP.z))
          own = drawShip(ship, a, t, { width: 230, col: HOLO, mine: true });

        // Combate: trazas de fuego entre hologramas
        if (combat && foe) {
          shotT -= dt;
          if (shotT < 0.25) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const fromOwn = Math.floor(t) % 2 === 0;
            const [s, e] = fromOwn ? [own, foe] : [foe, own];
            ctx.strokeStyle = fromOwn ? rgba(HOLO, 0.8) : rgba(FOE, 0.8);
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 8]);
            ctx.lineDashOffset = -t * 200;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
            ctx.stroke();
            ctx.restore();
            if (shotT < 0) shotT = 1.2 + Math.random() * 1.5;
          }
        }

        // Etiqueta anclada a la nave
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rgba(HOLO, 0.6);
        ctx.fillStyle = rgba(HOLO, 0.9);
        ctx.lineWidth = 1;
        const left = own.x < CX;
        const lx = left ? Math.max(150, own.x - 150) : Math.min(W - 150, own.x + 150);
        const ex = left ? lx - 120 : lx + 120;
        const ly = Math.max(40, own.y - 110);
        ctx.beginPath();
        ctx.moveTo(own.x, own.y - 30);
        ctx.lineTo(lx, ly);
        ctx.lineTo(ex, ly);
        ctx.stroke();
        ctx.font = "14px ui-monospace, monospace";
        ctx.textAlign = left ? "left" : "right";
        ctx.fillText(name.toUpperCase(), ex, ly - 8);
        ctx.font = "11px ui-monospace, monospace";
        ctx.fillText(`CASCO ${Math.round((1 - damage) * 100)} %`, ex, ly + 15);
        ctx.restore();

        // Motas de luz
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const m of motes) {
          m.y -= m.v * dt;
          if (m.y < 60) m.y = H - 60;
          ctx.fillStyle = rgba(HOLO, m.a * (0.6 + 0.4 * Math.sin(t * 2 + m.x)));
          ctx.fillRect(m.x, m.y, m.s, m.s);
        }
        ctx.restore();

        drawScan(t);
        if (glitch) {
          // Franja desplazada
          const hh = 18 + Math.random() * 30;
          ctx.drawImage(c, 0, glitchY, W, hh, (Math.random() - 0.5) * 40, glitchY, W, hh);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
    // `combat` llega como objeto nuevo en cada render: basta con su imagen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    image,
    fleet,
    name,
    damage,
    damagedModules,
    moving,
    warp,
    orbitBody,
    travel,
    combat?.enemyImage,
    repairing,
    shieldLevel,
  ]);

  const state = combat
    ? `COMBATE · ${combat.enemyName.toUpperCase()}`
    : travel === "return"
      ? "SALTO ANULADO · REGRESANDO"
      : travel
        ? "TRÁNSITO WARP"
        : moving
          ? "EN RUTA"
          : orbitBody
            ? `ÓRBITA · ${bodyName(orbitBody).toUpperCase()}`
            : "EN EL DISFORME";
  const chips = [
    state,
    warp && !combat ? "PROTECCIÓN WARP" : null,
    repairing ? "REPARANDO CASCO" : null,
  ].filter(Boolean) as string[];
  return (
    <section
      className="relative overflow-hidden rounded border border-cyan-400/30 bg-black"
      data-fleet={fleet}
      aria-label={`Proyección holográfica de ${name}: ${state.toLowerCase()}, casco ${hull}/${maxHull}`}
    >
      <canvas
        ref={canvas}
        className="block aspect-[24/13] w-full"
        role="img"
        aria-label={`Holograma de ${name} orbitando ${orbitBody ? bodyName(orbitBody) : "el disforme"}`}
      />
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 text-[11px] tracking-widest">
        {chips.map((ch) => (
          <span
            key={ch}
            className={`border px-2 py-0.5 ${combat && ch === state ? "border-red-400/70 text-red-300" : "border-cyan-300/50 text-cyan-200"} bg-black/40`}
          >
            {ch}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-6 text-xs">
        <span className="text-cyan-200">{name}</span>
        <span className={damage > 0 ? "text-red-300" : "text-cyan-100"}>
          Casco {hull}/{maxHull}
          {damage > 0
            ? ` · daños ${Math.round(damage * 100)} %`
            : damagedModules
              ? " · averías"
              : ""}
        </span>
      </div>
      {/* Esquinas del marco del proyector */}
      {[
        "left-1 top-1 border-l border-t",
        "right-1 top-1 border-r border-t",
        "bottom-1 left-1 border-b border-l",
        "bottom-1 right-1 border-b border-r",
      ].map((k) => (
        <span
          key={k}
          aria-hidden
          className={`pointer-events-none absolute size-5 border-cyan-300/60 ${k}`}
        />
      ))}
    </section>
  );
}
