import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FleetId } from "@/lib/ship-identity";
import { bodyName } from "@/lib/system";
import { BODY_TEXTURES } from "@/lib/system-art";
import { ATMOSPHERE, SHIELD_COLORS, SHIP_RIGS } from "@/components/ship/ship-scene-config";

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
  /** Naves de otros capitanes en la misma órbita. */
  neighbors?: string[];
}

const W = 1200;
const H = 650;

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  return img;
}

const ready = (img: HTMLImageElement | null | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/**
 * Vista exterior animada de la nave: estrellas con paralaje, planeta bajo la nave en órbita,
 * túnel warp en viaje, motores, escudos recibiendo impactos en combate, fugas de gas y reparaciones.
 * Solo presentación: el estado real lo aportan las consultas de la campaña y del mando naval.
 */
export function ShipExterior(props: ShipSceneProps) {
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
    neighbors = [],
  } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sound, setSound] = useState(false);
  const damage = Math.max(0, Math.min(1, 1 - hull / Math.max(1, maxHull)));
  const enginesOn = moving || !!travel || !!combat;
  const neighborKey = neighbors.join("|");

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = W;
    c.height = H;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rig = SHIP_RIGS[fleet];
    const shield = SHIELD_COLORS[fleet];
    const ship = loadImage(image);
    const planet =
      orbitBody && BODY_TEXTURES[orbitBody] ? loadImage(BODY_TEXTURES[orbitBody]) : null;
    const enemy = combat ? loadImage(combat.enemyImage) : null;
    const others = neighbors.slice(0, 4).map(loadImage);
    const atmo = (orbitBody && ATMOSPHERE[orbitBody]) || "#7fd0ff";

    // Geometría de la nave en el lienzo
    const shipW = combat ? 760 : 820;
    const shipX = combat ? 120 : 190;
    const shipY = orbitBody && !travel ? 70 : 105;
    const shipAt = (fx: number, fy: number, h: number) =>
      [shipX + fx * shipW, shipY + fy * h] as const;

    // Partículas
    const stars = [0.25, 0.55, 1].map((depth, layer) =>
      Array.from({ length: 70 + layer * 30 }, (_, i) => ({
        x: (i * 397.13 + layer * 131) % W,
        y: (i * 211.71 + layer * 57) % H,
        size: depth * (1 + (i % 3) * 0.5),
        depth,
        tw: (i * 1.7) % 6.28,
      })),
    );
    const warpStreaks = Array.from({ length: 140 }, (_, i) => ({
      a: (i * 2.39996) % 6.283,
      r: (i * 53) % 900,
      v: 0.6 + (i % 7) / 6,
    }));
    type Shot = {
      kind: "lance" | "shell" | "return";
      t: number;
      tx: number;
      ty: number;
      sx: number;
      sy: number;
      hitHull: boolean;
    };
    const shots: Shot[] = [];
    type Ripple = { x: number; y: number; t: number; hull: boolean };
    const ripples: Ripple[] = [];
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
    const sparks: Spark[] = [];
    let nextShot = 0.6;
    let lightning = 0;

    let frame = 0;
    let stopped = false;
    let visible = true;
    let last = performance.now();
    let time = 0;

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(c);

    const drawBackground = (t: number, dt: number) => {
      if (travel) {
        // Túnel warp: estelas radiales desde el punto de fuga (hacia delante o hacia atrás)
        const g = ctx.createRadialGradient(W * 0.78, H * 0.45, 20, W * 0.6, H * 0.5, W);
        g.addColorStop(0, "#f2d9ff");
        g.addColorStop(0.08, "#7a2fc0");
        g.addColorStop(0.45, "#2a0c4a");
        g.addColorStop(1, "#07030f");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const dir = travel === "return" ? -1 : 1;
        ctx.globalCompositeOperation = "screen";
        for (const s of warpStreaks) {
          s.r = (s.r + dir * s.v * 520 * dt + 900) % 900;
          const r0 = s.r,
            r1 = s.r + 60 + s.v * 80;
          const cx = W * 0.78,
            cy = H * 0.45;
          ctx.strokeStyle = `rgba(200,150,255,${Math.min(0.7, r0 / 500)})`;
          ctx.lineWidth = 1 + s.v;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(s.a) * r0 * 1.4, cy + Math.sin(s.a) * r0 * 0.8);
          ctx.lineTo(cx + Math.cos(s.a) * r1 * 1.4, cy + Math.sin(s.a) * r1 * 0.8);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
        // Relámpagos warp ocasionales
        if (!reduced && Math.random() < 0.012) lightning = 1;
        if (lightning > 0) {
          ctx.strokeStyle = `rgba(230,200,255,${lightning})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          let x = W * 0.78,
            y = H * 0.45;
          ctx.moveTo(x, y);
          const ang = Math.random() * 6.28;
          for (let k = 0; k < 8; k++) {
            x += Math.cos(ang) * 60 + (Math.random() - 0.5) * 50;
            y += Math.sin(ang) * 40 + (Math.random() - 0.5) * 50;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.fillStyle = `rgba(200,160,255,${lightning * 0.15})`;
          ctx.fillRect(0, 0, W, H);
          lightning -= 0.06;
        }
        return;
      }
      // Espacio: degradado con nebulosa tenue del color de la facción
      ctx.fillStyle = "#03040a";
      ctx.fillRect(0, 0, W, H);
      const neb = ctx.createRadialGradient(W * 0.8, H * 0.2, 10, W * 0.8, H * 0.2, W * 0.6);
      neb.addColorStop(0, hexA(shield, 0.1));
      neb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, W, H);
      const speed = moving || combat ? 60 : 6;
      for (const layer of stars) {
        for (const s of layer) {
          const x = (((s.x - t * speed * s.depth) % W) + W) % W;
          const tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(t * 1.5 + s.tw);
          ctx.globalAlpha = Math.min(1, (0.25 + s.depth * 0.6) * tw);
          ctx.fillStyle = s.depth > 0.9 ? "#e8eeff" : "#aab8ff";
          const len = moving ? s.size * 6 * s.depth : s.size;
          ctx.fillRect(x, s.y, Math.max(1, len), Math.max(1, s.size));
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawPlanet = (t: number) => {
      if (!orbitBody || travel) return;
      const R = 1500;
      const cx = W / 2,
        cy = H + R - 170;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      if (ready(planet)) {
        const texH = 520,
          texW = texH * (planet.naturalWidth / planet.naturalHeight);
        const off = (reduced ? 0 : t * 8) % texW;
        for (let x = -off - texW; x < W + texW; x += texW)
          ctx.drawImage(planet, x, H - 200, texW, texH);
      } else {
        ctx.fillStyle = "#1b2a3a";
        ctx.fillRect(0, H - 200, W, 200);
      }
      // Sombreado esférico y terminador
      const shade = ctx.createLinearGradient(0, 0, W, 0);
      shade.addColorStop(0, "rgba(0,0,0,0.75)");
      shade.addColorStop(0.45, "rgba(0,0,0,0.15)");
      shade.addColorStop(1, "rgba(0,0,0,0.05)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, H - 220, W, 220);
      const depthShade = ctx.createLinearGradient(0, H - 180, 0, H);
      depthShade.addColorStop(0, "rgba(0,0,0,0)");
      depthShade.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = depthShade;
      ctx.fillRect(0, H - 220, W, 220);
      ctx.restore();
      // Atmósfera: borde luminoso
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hexA(atmo, 0.35 - i * 0.1);
        ctx.lineWidth = 6 + i * 10;
        ctx.beginPath();
        ctx.arc(cx, cy, R + i * 6, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      }
      ctx.restore();
      // Naves vecinas en órbita, lejanas
      others.forEach((img, i) => {
        if (!ready(img)) return;
        const w = 110 - i * 12;
        const x = ((W + 200 - ((t * (10 + i * 4) + i * 330) % (W + 400)) + W) % (W + 400)) - 200;
        const y = 60 + i * 42;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.globalCompositeOperation = "lighten";
        ctx.drawImage(img, x, y, w, (img.naturalHeight / img.naturalWidth) * w);
        ctx.restore();
      });
    };

    const drawEngines = (t: number, h: number, bob: number) => {
      const power = enginesOn ? 1 : 0.35;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const [fx, fy] of rig.engines) {
        const [x, y] = shipAt(fx, fy, h);
        const flick = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 30 + fx * 10);
        if (rig.halo) {
          const r = (40 + 50 * power) * flick;
          const g = ctx.createRadialGradient(x, y + bob, 0, x, y + bob, r);
          g.addColorStop(0, hexA(rig.glow, 0.9 * power));
          g.addColorStop(1, hexA(rig.glow, 0));
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y + bob - r, r * 2, r * 2);
          continue;
        }
        const len = ((rig.builtInFlames ? 50 : 70) + (enginesOn ? 170 : 25)) * flick;
        const yy = y + bob;
        // Resplandor exterior
        const halo = ctx.createRadialGradient(x, yy, 0, x, yy, 34 + 30 * power);
        halo.addColorStop(0, hexA(rig.glow, 0.55 * power + 0.15));
        halo.addColorStop(1, hexA(rig.glow, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(x - 70, yy - 70, 140, 140);
        // Chorro cónico: ancho en la tobera, afilado en la punta
        const flame = ctx.createLinearGradient(x - len, yy, x, yy);
        flame.addColorStop(0, hexA(rig.glow, 0));
        flame.addColorStop(0.55, hexA(rig.glow, 0.35 * power + 0.1));
        flame.addColorStop(0.9, hexA(rig.glow, 0.75 * power + 0.15));
        flame.addColorStop(1, "rgba(255,255,255,0.9)");
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.moveTo(x + 4, yy - 9);
        ctx.quadraticCurveTo(x - len * 0.35, yy - 7, x - len, yy);
        ctx.quadraticCurveTo(x - len * 0.35, yy + 7, x + 4, yy + 9);
        ctx.closePath();
        ctx.fill();
        // Núcleo blanco
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.ellipse(x, yy, 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawNavLights = (t: number, h: number, bob: number) => {
      const blink = reduced ? true : Math.floor(t * 1.4) % 2 === 0;
      if (!blink) return;
      const lights: [number, number, string][] = [
        [0.93, 0.5, "#ff3b3b"],
        [0.2, 0.2, "#3bff7a"],
        [0.55, 0.3, "#ffffff"],
      ];
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const [fx, fy, col] of lights) {
        const [x, y] = shipAt(fx, fy, h);
        const g = ctx.createRadialGradient(x, y + bob, 0, x, y + bob, 10);
        g.addColorStop(0, col);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 10, y + bob - 10, 20, 20);
      }
      ctx.restore();
    };

    const drawDamage = (t: number, h: number, bob: number) => {
      const breaches =
        damage > 0
          ? Math.min(rig.hot.length, Math.ceil(damage * rig.hot.length))
          : Math.min(2, damagedModules);
      for (let n = 0; n < breaches; n++) {
        const hot = rig.hot[n];
        if (!hot) continue;
        const [x, y0] = shipAt(hot[0], hot[1], h);
        const y = y0 + bob;
        // Fuga de gas que se arrastra hacia popa
        for (let k = 0; k < 16; k++) {
          const age = reduced ? k / 16 : (t * 0.6 + k / 16 + n * 0.23) % 1;
          ctx.globalAlpha = (1 - age) * 0.45;
          ctx.fillStyle = n % 2 ? "#cfd6e0" : "#9aa4b0";
          const r = 3 + age * 22;
          ctx.beginPath();
          ctx.arc(
            x - age * (enginesOn ? 220 : 90),
            y - age * 60 - Math.sin(age * 6 + n) * 8,
            r,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Brecha incandescente
        const pulse = reduced ? 0.8 : 0.6 + 0.4 * Math.sin(t * 9 + n * 2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, `rgba(255,200,120,${pulse})`);
        g.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 14, y - 14, 28, 28);
        // Chispas ocasionales
        if (!reduced && Math.random() < 0.05 + damage * 0.1) {
          for (let s = 0; s < 6; s++)
            sparks.push({
              x,
              y,
              vx: (Math.random() - 0.7) * 160,
              vy: (Math.random() - 0.5) * 160,
              life: 1,
              color: "#ffd27a",
            });
        }
      }
    };

    const drawRepair = (t: number, h: number, bob: number) => {
      if (!repairing) return;
      for (let d = 0; d < 3; d++) {
        const hot = rig.hot[d % rig.hot.length]!;
        const [hx, hy] = shipAt(hot[0], hot[1], h);
        const a = reduced ? d * 2 : t * (1.2 + d * 0.3) + d * 2;
        const x = hx + Math.cos(a) * 40;
        const y = hy + bob - 30 + Math.sin(a) * 18;
        // Dron de reparación con baliza
        ctx.fillStyle = "#c8d2dc";
        ctx.fillRect(x - 7, y - 4, 14, 8);
        ctx.fillStyle = "#6b7480";
        ctx.fillRect(x - 10, y - 1, 3, 2);
        ctx.fillRect(x + 7, y - 1, 3, 2);
        if (reduced || Math.sin(t * 6 + d) > 0) {
          ctx.fillStyle = "#ffcc33";
          ctx.beginPath();
          ctx.arc(x, y - 6, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // Soldadura
        if (reduced || Math.sin(t * 20 + d * 3) > 0.4) {
          ctx.strokeStyle = "rgba(160,220,255,0.9)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y + 3);
          ctx.lineTo(hx, hy + bob);
          ctx.stroke();
          const g = ctx.createRadialGradient(hx, hy + bob, 0, hx, hy + bob, 12);
          g.addColorStop(0, "rgba(255,255,255,0.95)");
          g.addColorStop(1, "rgba(120,200,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(hx - 12, hy + bob - 12, 24, 24);
        }
      }
    };

    // Burbuja de escudos centrada en la nave
    const shieldGeom = (h: number, bob: number) => ({
      cx: shipX + shipW * 0.5,
      cy: shipY + h * 0.48 + bob,
      rx: shipW * 0.56,
      ry: h * 0.55,
    });

    const drawCombat = (t: number, dt: number, h: number, bob: number) => {
      if (!combat) return;
      const sg = shieldGeom(h, bob);
      // Nave enemiga a distancia, a la derecha
      const ex = W - 210,
        ey = 120 + Math.sin(t * 0.7) * 10;
      if (ready(enemy)) {
        ctx.save();
        ctx.globalCompositeOperation = "lighten";
        ctx.translate(ex + 170, ey);
        ctx.scale(-1, 1); // mira hacia nuestra nave
        ctx.drawImage(enemy, 0, 0, 170, (enemy.naturalHeight / enemy.naturalWidth) * 170);
        ctx.restore();
      }
      const emx = ex + 20,
        emy = ey + 50;
      // Programar disparos
      nextShot -= dt;
      if (!reduced && nextShot <= 0) {
        // Punto de impacto en la cara del escudo orientada al enemigo
        const ang =
          Math.atan2((emy - sg.cy) / sg.ry, (emx - sg.cx) / sg.rx) + (Math.random() - 0.5) * 1.1;
        const tx = sg.cx + Math.cos(ang) * sg.rx * 0.97;
        const ty = sg.cy + Math.sin(ang) * sg.ry * 0.97;
        const hitHull = damage > 0.5 && Math.random() < 0.3;
        const r = Math.random();
        if (r < 0.35) shots.push({ kind: "lance", t: 0, sx: emx, sy: emy, tx, ty, hitHull });
        else if (r < 0.8)
          for (let k = 0; k < 4; k++)
            shots.push({
              kind: "shell",
              t: -k * 0.08,
              sx: emx,
              sy: emy + k * 6,
              tx: tx + (Math.random() - 0.5) * 60,
              ty: ty + (Math.random() - 0.5) * 60,
              hitHull,
            });
        else {
          const [fx, fy] = shipAt(0.85, 0.42, h);
          shots.push({
            kind: "return",
            t: 0,
            sx: fx,
            sy: fy + bob,
            tx: emx + 40,
            ty: emy,
            hitHull: false,
          });
        }
        nextShot = 0.35 + Math.random() * 0.9;
      }
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]!;
        s.t += dt * (s.kind === "lance" ? 4 : 1.6);
        if (s.t < 0) continue;
        const p = Math.min(1, s.t);
        const x = s.sx + (s.tx - s.sx) * p,
          y = s.sy + (s.ty - s.sy) * p;
        if (s.kind === "lance") {
          ctx.strokeStyle = `rgba(255,240,200,${1 - Math.max(0, s.t - 1)})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(s.sx, s.sy);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,120,60,0.5)";
          ctx.lineWidth = 10;
          ctx.stroke();
        } else {
          ctx.fillStyle = s.kind === "return" ? "#ffd27a" : "#ffb070";
          ctx.beginPath();
          ctx.arc(x, y, s.kind === "return" ? 3 : 4, 0, Math.PI * 2);
          ctx.fill();
        }
        if (s.t >= 1 && s.t - dt * 4 < 1) {
          if (s.kind === "return") {
            for (let k = 0; k < 10; k++)
              sparks.push({
                x: s.tx,
                y: s.ty,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * 200,
                life: 1,
                color: "#ffe0a0",
              });
          } else ripples.push({ x: s.tx, y: s.ty, t: 0, hull: s.hitHull });
        }
        if (s.t > (s.kind === "lance" ? 1.4 : 1)) shots.splice(i, 1);
      }
      ctx.restore();
    };

    const drawShield = (t: number, dt: number, h: number, bob: number) => {
      const sg = shieldGeom(h, bob);
      const always = combat || warp;
      if (always) {
        const base = combat ? 0.03 + 0.025 * Math.min(3, shieldLevel) : 0.03;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const g = ctx.createRadialGradient(sg.cx, sg.cy, sg.ry * 0.85, sg.cx, sg.cy, sg.rx);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(
          0.85,
          hexA(
            warp && !combat ? "#b48cff" : shield,
            base * (reduced ? 1 : 0.8 + 0.2 * Math.sin(t * 2)),
          ),
        );
        g.addColorStop(1, hexA(warp && !combat ? "#b48cff" : shield, base * 2));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sg.cx, sg.cy, sg.rx, sg.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Impactos: onda hexagonal en el escudo o explosión en el casco
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]!;
        r.t += dt;
        const p = r.t / 0.7;
        if (p >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        if (r.hull) {
          const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 70 * p + 10);
          g.addColorStop(0, `rgba(255,255,220,${1 - p})`);
          g.addColorStop(0.4, `rgba(255,140,40,${(1 - p) * 0.8})`);
          g.addColorStop(1, "rgba(80,20,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(r.x - 90, r.y - 90, 180, 180);
          if (p < 0.05)
            for (let k = 0; k < 14; k++)
              sparks.push({
                x: r.x,
                y: r.y,
                vx: (Math.random() - 0.5) * 260,
                vy: (Math.random() - 0.5) * 260,
                life: 1,
                color: "#ff9a4a",
              });
        } else {
          ctx.strokeStyle = hexA(shield, (1 - p) * 0.9);
          ctx.lineWidth = 2;
          const size = 18 + p * 70;
          for (let ring = 0; ring < 2; ring++) {
            const s = size * (1 - ring * 0.45);
            ctx.beginPath();
            for (let k = 0; k <= 6; k++) {
              const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
              const px = r.x + Math.cos(a) * s,
                py = r.y + Math.sin(a) * s * 0.8;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
          const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, size);
          g.addColorStop(0, hexA(shield, (1 - p) * 0.6));
          g.addColorStop(1, hexA(shield, 0));
          ctx.fillStyle = g;
          ctx.fillRect(r.x - size, r.y - size, size * 2, size * 2);
        }
        ctx.restore();
      }
    };

    const drawSparks = (dt: number) => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.life -= dt * 1.6;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, 2, 2);
      }
      ctx.restore();
      if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
    };

    const draw = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) {
        frame = requestAnimationFrame(draw);
        return;
      }
      time += dt;
      const t = reduced ? 0 : time;
      const h = ready(ship) ? (ship.naturalHeight / ship.naturalWidth) * shipW : shipW * 0.66;
      const bob = reduced ? 0 : Math.sin(t * 0.8) * 6 + (combat ? Math.sin(t * 13) * 1.5 : 0);

      drawBackground(t, dt);
      drawPlanet(t);
      drawEngines(t, h, bob);
      if (ready(ship)) {
        ctx.save();
        ctx.globalCompositeOperation = "lighten";
        ctx.translate(0, bob);
        // Leve cabeceo
        if (!reduced) {
          ctx.translate(shipX + shipW / 2, shipY + h / 2);
          ctx.rotate(Math.sin(t * 0.5) * 0.008);
          ctx.translate(-(shipX + shipW / 2), -(shipY + h / 2));
        }
        ctx.drawImage(ship, shipX, shipY, shipW, h);
        ctx.restore();
      }
      drawNavLights(t, h, bob);
      drawDamage(t, h, bob);
      drawRepair(t, h, bob);
      drawCombat(t, dt, h, bob);
      drawShield(t, dt, h, bob);
      drawSparks(dt);

      if (reduced) return; // un fotograma fijo con todos los elementos
      frame = requestAnimationFrame(draw);
    };

    const start = () => {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    };
    if (reduced) {
      // Dibujar cuando carguen las imágenes
      const imgs = [ship, planet, enemy, ...others].filter((i): i is HTMLImageElement => !!i);
      let pending = imgs.length;
      const done = () => {
        pending -= 1;
        if (pending <= 0) start();
      };
      imgs.forEach((i) => (i.complete ? done() : i.addEventListener("load", done, { once: true })));
      if (!imgs.length) start();
    } else start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      io.disconnect();
    };
    // neighborKey resume la lista de naves vecinas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    image,
    fleet,
    damage,
    damagedModules,
    moving,
    warp,
    orbitBody,
    travel,
    combat?.enemyImage,
    repairing,
    shieldLevel,
    neighborKey,
    enginesOn,
  ]);

  // Zumbido de motores (opcional)
  useEffect(() => {
    if (!sound) return;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = travel ? 45 : enginesOn ? 38 : 30;
    filter.type = "lowpass";
    filter.frequency.value = 110;
    gain.gain.value = enginesOn ? 0.06 : 0.03;
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    return () => {
      oscillator.stop();
      void audio.close();
    };
  }, [sound, enginesOn, travel]);

  const state = combat
    ? `COMBATE · ${combat.enemyName.toUpperCase()}`
    : travel === "return"
      ? "SALTO ANULADO · REGRESANDO"
      : travel
        ? "TRÁNSITO WARP"
        : moving
          ? "PROPULSORES ACTIVOS · EN RUTA"
          : orbitBody
            ? `ÓRBITA · ${bodyName(orbitBody).toUpperCase()}`
            : "ÓRBITA ESTABLE";
  const chips = [
    state,
    warp && !combat ? "PROTECCIÓN WARP" : null,
    repairing ? "REPARANDO CASCO" : null,
  ].filter(Boolean);

  return (
    <section
      className="ship-exterior relative overflow-hidden"
      data-fleet={fleet}
      aria-label={`Vista exterior de ${name}: ${state.toLowerCase()}, casco ${hull}/${maxHull}${damage > 0 ? ", daños y fugas de gas" : ""}${repairing ? ", reparación en curso" : ""}`}
    >
      <canvas
        ref={canvas}
        className="block aspect-[24/13] w-full"
        role="img"
        aria-label={`Nave ${name} con ${Math.round(damage * 100)}% de daño de casco`}
      />
      <div className="absolute left-3 top-3 flex flex-wrap gap-2 text-xs">
        {chips.map((c) => (
          <span
            key={c}
            className={`border bg-background/60 px-2 py-0.5 ${combat && c === state ? "border-destructive text-destructive" : "border-border text-space-gas"}`}
          >
            {c}
          </span>
        ))}
      </div>
      <Button
        variant="outline"
        size="icon"
        className="absolute right-3 top-3 bg-background"
        aria-label={sound ? "Silenciar motores" : "Activar sonido de motores"}
        title={sound ? "Silenciar motores" : "Activar sonido de motores"}
        onClick={() => setSound(!sound)}
      >
        {sound ? <Volume2 /> : <VolumeX />}
      </Button>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-background/80 px-3 py-2 text-xs">
        <span className="text-primary">{name}</span>
        <span className={damage > 0 ? "text-destructive" : "text-foreground"}>
          Casco {hull}/{maxHull} ·{" "}
          {damage > 0
            ? `Daños ${Math.round(damage * 100)}%`
            : damagedModules
              ? "Averías de sistemas"
              : "Sin brechas"}
        </span>
      </div>
    </section>
  );
}
