/**
 * Efectos en canvas para el auspex (coordenadas 320×320, como el SVG del radar).
 * Proyectiles que se ven salir de una nave y viajar hasta impactar (o pasar de largo si fallan),
 * torpedos con estela que pueden ser esquivados, haces de lanza, escudos, explosiones con humo,
 * embestidas, saltos disformes, motores y textos flotantes de daño.
 * Si la biblioteca tiene hojas de sprites de explosiones reales, se dibujan encima.
 */
import { SPRITES, type SpriteSheet } from "@/lib/sfx/library";

export interface P {
  x: number;
  y: number;
}

type RGB = [number, number, number];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: RGB;
  drag: number;
  grow: number;
  glow: boolean;
  delay: number;
}

interface Beam {
  a: P;
  b: P;
  life: number;
  max: number;
  width: number;
  color: RGB;
  delay: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  color: RGB;
  width: number;
  delay: number;
  arc?: [number, number];
}

interface Missile {
  kind: "shell" | "torpedo";
  from: P;
  to: P;
  t: number;
  dur: number;
  delay: number;
  wobble: number;
  /** Al llegar: explota (impacto), sigue de largo y se apaga (fallo) o se queda en vuelo (salva lanzada). */
  end: "hit" | "miss" | "hold";
  color: RGB;
  onHit?: () => void;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: RGB;
  life: number;
  max: number;
  delay: number;
  size: number;
}

interface SpriteFx {
  sheet: SpriteSheet;
  img: HTMLImageElement;
  x: number;
  y: number;
  scale: number;
  t: number;
  fps: number;
  delay: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const images = new Map<string, HTMLImageElement>();
function img(src: string) {
  let i = images.get(src);
  if (!i) {
    i = new Image();
    i.src = src;
    images.set(src, i);
  }
  return i;
}

/** Punto más allá de `to`, en la misma dirección, desviado a un lado (para los fallos). */
function pastPoint(from: P, to: P, extra: number, side: number): P {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { x: to.x + ux * extra - uy * side, y: to.y + uy * extra + ux * side };
}

export class FxEngine {
  private ctx: CanvasRenderingContext2D;
  private parts: Particle[] = [];
  private beams: Beam[] = [];
  private rings: Ring[] = [];
  private missiles: Missile[] = [];
  private texts: FloatText[] = [];
  private sprites: SpriteFx[] = [];
  private raf = 0;
  private last = 0;
  private scale = 1;
  /** Multiplicador de velocidad de la repetición. */
  speed = 1;
  shake = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 320;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(w * dpr);
    this.scale = (w * dpr) / 320;
  }

  clear() {
    this.parts = [];
    this.beams = [];
    this.rings = [];
    this.missiles = [];
    this.texts = [];
    this.sprites = [];
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  private busy() {
    return (
      this.parts.length ||
      this.beams.length ||
      this.rings.length ||
      this.missiles.length ||
      this.texts.length ||
      this.sprites.length ||
      this.shake > 0.05
    );
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.speed;
      this.last = now;
      this.step(dt);
      this.draw();
      if (this.busy()) this.raf = requestAnimationFrame(loop);
      else {
        this.raf = 0;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ───── Emisores básicos ─────

  private burst(
    at: P,
    n: number,
    o: Partial<Particle> & { speed: [number, number]; spread?: number; dir?: number },
    delay = 0,
  ) {
    for (let i = 0; i < n; i++) {
      const ang =
        o.dir !== undefined
          ? o.dir + rand(-(o.spread ?? Math.PI), o.spread ?? Math.PI)
          : rand(0, Math.PI * 2);
      const sp = rand(o.speed[0], o.speed[1]);
      const max = o.max ?? rand(0.4, 1);
      this.parts.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: max * rand(0.7, 1.1),
        max,
        size: (o.size ?? 2) * rand(0.7, 1.3),
        color: o.color ?? [255, 200, 120],
        drag: o.drag ?? 2,
        grow: o.grow ?? 0,
        glow: o.glow ?? true,
        delay: delay + rand(0, 0.06),
      });
    }
  }

  private sprite(kind: "explosion" | "explosion_grande", at: P, scale: number, delay: number) {
    const sheet = SPRITES[kind];
    if (!sheet) return;
    this.sprites.push({
      sheet,
      img: img(sheet.src),
      x: at.x,
      y: at.y,
      scale,
      t: 0,
      fps: 30,
      delay,
    });
  }

  /** Texto flotante (daño, «ESQUIVADO», «ESCUDOS»…). */
  text(at: P, text: string, color: RGB, delay = 0, size = 11) {
    this.texts.push({
      x: at.x + rand(-6, 6),
      y: at.y - 12,
      text,
      color,
      life: 1.6,
      max: 1.6,
      delay,
      size,
    });
    this.kick();
  }

  explosion(at: P, power = 1, delay = 0) {
    this.burst(
      at,
      Math.round(16 * power),
      { speed: [15, 80 * power], size: 1.5, color: [255, 230, 170], max: 0.45, drag: 3 },
      delay,
    );
    this.burst(
      at,
      Math.round(10 * power),
      {
        speed: [4, 28 * power],
        size: 5 * power,
        color: [255, 120, 40],
        max: 0.7,
        drag: 2,
        grow: 7,
      },
      delay,
    );
    this.burst(
      at,
      Math.round(7 * power),
      {
        speed: [2, 12],
        size: 6 * power,
        color: [90, 82, 80],
        max: 1.8,
        drag: 1,
        grow: 10,
        glow: false,
      },
      delay + 0.1,
    );
    this.burst(
      at,
      Math.round(6 * power),
      { speed: [30, 70], size: 1.1, color: [255, 200, 120], max: 1.1, drag: 0.6 },
      delay,
    );
    this.rings.push({
      x: at.x,
      y: at.y,
      r: 2,
      vr: 75 * power,
      life: 0.35,
      max: 0.35,
      color: [255, 230, 190],
      width: 2,
      delay,
    });
    this.sprite(power > 1.5 ? "explosion_grande" : "explosion", at, 0.25 * power, delay);
    this.shakeAt(2 * power, delay);
    this.kick();
  }

  private shakeAt(v: number, delay: number) {
    if (delay <= 0) this.shake = Math.max(this.shake, v);
    else
      this.parts.push({
        x: -99,
        y: -99,
        vx: 0,
        vy: 0,
        life: 0.01,
        max: 0.01,
        size: 0,
        color: [0, 0, 0],
        drag: 0,
        grow: v,
        glow: false,
        delay,
      });
  }

  destruction(at: P, delay = 0) {
    for (let i = 0; i < 6; i++)
      this.explosion({ x: at.x + rand(-12, 12), y: at.y + rand(-12, 12) }, 1.2, delay + i * 0.22);
    this.rings.push({
      x: at.x,
      y: at.y,
      r: 4,
      vr: 170,
      life: 1.2,
      max: 1.2,
      color: [180, 220, 255],
      width: 3,
      delay: delay + 1.3,
    });
    this.burst(
      at,
      70,
      { speed: [30, 150], size: 1.8, color: [255, 240, 200], max: 1.5, drag: 0.9 },
      delay + 1.3,
    );
    this.burst(
      at,
      24,
      { speed: [5, 40], size: 8, color: [70, 60, 60], max: 3.2, drag: 0.6, grow: 14, glow: false },
      delay + 1.4,
    );
    this.sprite("explosion_grande", at, 0.6, delay + 1.3);
    this.shakeAt(9, delay + 1.3);
    this.kick();
  }

  /** Haz de lanza: carga en el emisor y descarga instantánea. */
  lance(from: P, to: P, color: RGB, delay = 0, hit = true) {
    this.burst(from, 14, { speed: [4, 14], size: 1.6, color, max: 0.45, drag: 4 }, delay);
    const end = hit ? to : pastPoint(from, to, 40, rand(-14, 14));
    this.beams.push({
      a: from,
      b: end,
      life: 0.5,
      max: 0.5,
      width: 2.5,
      color,
      delay: delay + 0.35,
    });
    this.beams.push({
      a: from,
      b: end,
      life: 0.28,
      max: 0.28,
      width: 7,
      color,
      delay: delay + 0.38,
    });
    if (hit)
      this.burst(
        to,
        20,
        { speed: [10, 60], size: 1.5, color: [255, 255, 255], max: 0.4 },
        delay + 0.4,
      );
    this.kick();
  }

  /** Andanada: proyectiles que se ven viajar; los aciertos estallan en el blanco y los fallos pasan de largo. */
  battery(from: P, to: P, hits: number, misses: number, color: RGB, delay = 0, onHit?: () => void) {
    const n = Math.min(18, hits + misses);
    const order = Array.from({ length: n }, (_, i) =>
      i < Math.min(hits, n) ? "hit" : "miss",
    ).sort(() => Math.random() - 0.5);
    order.forEach((end, i) => {
      const d = delay + i * 0.09 + rand(0, 0.05);
      const off = { x: from.x + rand(-6, 6), y: from.y + rand(-6, 6) };
      const tgt =
        end === "hit"
          ? { x: to.x + rand(-6, 6), y: to.y + rand(-6, 6) }
          : pastPoint(from, to, rand(25, 45), rand(-22, 22));
      const dist = Math.hypot(tgt.x - off.x, tgt.y - off.y);
      this.missiles.push({
        kind: "shell",
        from: off,
        to: tgt,
        t: 0,
        dur: 0.35 + dist / 260,
        delay: d,
        wobble: 0,
        end: end as "hit" | "miss",
        color,
        ...(i === 0 && onHit ? { onHit } : {}),
      });
      this.burst(off, 3, { speed: [10, 30], size: 1.6, color: [255, 235, 170], max: 0.18 }, d);
    });
    this.kick();
  }

  /** Torpedos: los que aciertan estallan; los esquivados pasan de largo y se apagan. */
  torpedoes(from: P, to: P, hits: number, dodged: number, delay = 0, dur = 1.3) {
    const n = hits + dodged;
    for (let i = 0; i < n; i++) {
      const hit = i < hits;
      const tgt = hit
        ? { x: to.x + rand(-4, 4), y: to.y + rand(-4, 4) }
        : pastPoint(from, to, rand(35, 60), (i % 2 ? 1 : -1) * rand(14, 30));
      this.missiles.push({
        kind: "torpedo",
        from: { x: from.x + rand(-4, 4), y: from.y + rand(-4, 4) },
        to: tgt,
        t: 0,
        dur: dur * (hit ? 1 : 1.35) + rand(-0.1, 0.15),
        delay: delay + i * 0.1,
        wobble: rand(-12, 12),
        end: hit ? "hit" : "miss",
        color: [255, 210, 120],
      });
    }
    this.kick();
  }

  /** Salva lanzada que impactará en la fase siguiente: sale del tubo y se queda en vuelo. */
  launch(from: P, to: P, n: number, delay = 0) {
    for (let i = 0; i < n; i++) {
      const k = 0.38 + i * 0.03;
      const tgt = {
        x: from.x + (to.x - from.x) * k + rand(-5, 5),
        y: from.y + (to.y - from.y) * k + rand(-5, 5),
      };
      this.missiles.push({
        kind: "torpedo",
        from: { x: from.x + rand(-3, 3), y: from.y + rand(-3, 3) },
        to: tgt,
        t: 0,
        dur: 1.1,
        delay: delay + i * 0.1,
        wobble: rand(-6, 6),
        end: "hold",
        color: [255, 210, 120],
      });
    }
    this.burst(from, 14, { speed: [10, 40], size: 2, color: [255, 220, 170], max: 0.45 }, delay);
    this.kick();
  }

  shield(at: P, from: P, delay = 0, strong = false) {
    const ang = Math.atan2(from.y - at.y, from.x - at.x);
    const r = strong ? 18 : 14;
    this.rings.push({
      x: at.x,
      y: at.y,
      r,
      vr: 6,
      life: 0.7,
      max: 0.7,
      color: [110, 190, 255],
      width: strong ? 4 : 3,
      delay,
      arc: [ang - (strong ? 1.4 : 0.9), ang + (strong ? 1.4 : 0.9)],
    });
    this.burst(
      { x: at.x + Math.cos(ang) * r, y: at.y + Math.sin(ang) * r },
      strong ? 18 : 10,
      { speed: [10, 40], size: 1.4, color: [160, 220, 255], max: 0.4 },
      delay,
    );
    this.kick();
  }

  /** Burbuja de escudos al máximo alrededor de una nave. */
  shieldBubble(at: P, delay = 0) {
    this.rings.push({
      x: at.x,
      y: at.y,
      r: 20,
      vr: 0,
      life: 2.2,
      max: 2.2,
      color: [110, 190, 255],
      width: 1.5,
      delay,
    });
    this.kick();
  }

  ram(at: P, delay = 0) {
    this.burst(
      at,
      45,
      { speed: [20, 120], size: 1.6, color: [255, 230, 160], max: 0.8, drag: 2 },
      delay,
    );
    this.explosion(at, 1.4, delay + 0.05);
    this.shakeAt(8, delay);
    this.kick();
  }

  /** Estela de motores. `heading` en radianes del canvas (0 = arriba). */
  engines(at: P, heading: number, strong: boolean, delay = 0) {
    const back = heading + Math.PI / 2;
    this.burst(
      at,
      strong ? 30 : 8,
      {
        speed: [20, strong ? 75 : 35],
        size: strong ? 3 : 2,
        color: strong ? [120, 190, 255] : [255, 170, 90],
        max: strong ? 0.9 : 0.5,
        dir: back,
        spread: 0.22,
        drag: 1.5,
        grow: 2,
      },
      delay,
    );
    this.kick();
  }

  /** Esquiva visible: chispas laterales de los impulsores. */
  jink(at: P, delay = 0) {
    this.burst(
      at,
      10,
      { speed: [30, 60], size: 1.4, color: [180, 220, 255], max: 0.35, drag: 3 },
      delay,
    );
    this.kick();
  }

  warp(at: P, success: boolean, delay = 0) {
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const r = 36;
      const p = { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
      this.parts.push({
        x: p.x,
        y: p.y,
        vx: -Math.cos(a) * 40 - Math.sin(a) * 55,
        vy: -Math.sin(a) * 40 + Math.cos(a) * 55,
        life: 1.3,
        max: 1.3,
        size: 2.4,
        color: success ? [200, 120, 255] : [255, 80, 120],
        drag: 0.8,
        grow: 0,
        glow: true,
        delay: delay + i * 0.015,
      });
    }
    this.rings.push({
      x: at.x,
      y: at.y,
      r: 42,
      vr: -30,
      life: 1.3,
      max: 1.3,
      color: [210, 140, 255],
      width: 2,
      delay,
    });
    if (success)
      this.rings.push({
        x: at.x,
        y: at.y,
        r: 2,
        vr: 130,
        life: 0.5,
        max: 0.5,
        color: [255, 220, 255],
        width: 4,
        delay: delay + 1.4,
      });
    else this.explosion(at, 0.8, delay + 1.3);
    this.kick();
  }

  // ───── Simulación y dibujo ─────

  private step(dt: number) {
    const keep = <T extends { delay: number }>(arr: T[], upd: (x: T) => boolean) =>
      arr.filter((x) => {
        if (x.delay > 0) {
          x.delay -= dt;
          return true;
        }
        return upd(x);
      });
    this.parts = keep(this.parts, (p) => {
      if (p.x === -99) {
        this.shake = Math.max(this.shake, p.grow);
        return false;
      }
      p.life -= dt;
      p.vx *= Math.exp(-p.drag * dt);
      p.vy *= Math.exp(-p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      return p.life > 0;
    });
    this.beams = keep(this.beams, (b) => (b.life -= dt) > 0);
    this.rings = keep(this.rings, (r) => {
      r.life -= dt;
      r.r = Math.max(0, r.r + r.vr * dt);
      return r.life > 0;
    });
    this.texts = keep(this.texts, (t) => {
      t.life -= dt;
      t.y -= 14 * dt;
      return t.life > 0;
    });
    this.missiles = keep(this.missiles, (m) => {
      m.t += dt / m.dur;
      const p = this.missilePos(m);
      if (m.kind === "torpedo")
        this.parts.push({
          x: p.x,
          y: p.y,
          vx: rand(-4, 4),
          vy: rand(-4, 4),
          life: 0.7,
          max: 0.7,
          size: 1.4,
          color: [190, 180, 170],
          drag: 1,
          grow: 3,
          glow: false,
          delay: 0,
        });
      else if (Math.random() < 0.6)
        this.parts.push({
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          life: 0.18,
          max: 0.18,
          size: 1.3,
          color: m.color,
          drag: 0,
          grow: 0,
          glow: true,
          delay: 0,
        });
      if (m.t >= 1) {
        if (m.end === "hit") {
          m.onHit?.();
          if (m.kind === "torpedo") this.explosion(m.to, 0.75);
          else {
            this.burst(m.to, 7, { speed: [10, 45], size: 1.6, color: [255, 210, 130], max: 0.35 });
            this.burst(m.to, 2, {
              speed: [2, 8],
              size: 3,
              color: [90, 80, 80],
              max: 0.9,
              grow: 5,
              glow: false,
            });
          }
        }
        return m.end === "hold" ? m.t < 1.6 : false;
      }
      return true;
    });
    this.sprites = keep(this.sprites, (s) => (s.t += dt) * s.fps < s.sheet.frames);
    this.shake *= Math.exp(-6 * dt);
  }

  private missilePos(m: Missile): P {
    const t = Math.min(1, m.t);
    const dx = m.to.x - m.from.x;
    const dy = m.to.y - m.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const w = Math.sin(t * Math.PI) * m.wobble;
    return { x: m.from.x + dx * t + (-dy / len) * w, y: m.from.y + dy * t + (dx / len) * w };
  }

  private draw() {
    const c = this.ctx;
    const s = this.scale;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    c.setTransform(s, 0, 0, s, sx * s, sy * s);
    c.globalCompositeOperation = "lighter";
    for (const b of this.beams) {
      if (b.delay > 0) continue;
      const k = b.life / b.max;
      c.strokeStyle = `rgba(${b.color.join(",")},${k})`;
      c.lineWidth = b.width * (0.6 + 0.4 * Math.random());
      c.shadowColor = `rgb(${b.color.join(",")})`;
      c.shadowBlur = 12;
      c.beginPath();
      c.moveTo(b.a.x, b.a.y);
      c.lineTo(b.b.x, b.b.y);
      c.stroke();
    }
    c.shadowBlur = 0;
    for (const m of this.missiles) {
      if (m.delay > 0) continue;
      const p = this.missilePos(m);
      const fadeOut = m.end === "miss" ? Math.max(0, 1 - Math.max(0, m.t - 0.75) * 4) : 1;
      c.fillStyle = `rgba(${m.color.join(",")},${fadeOut})`;
      c.beginPath();
      c.arc(p.x, p.y, m.kind === "torpedo" ? 2.4 : 1.5, 0, Math.PI * 2);
      c.fill();
      if (m.kind === "torpedo") {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6);
        g.addColorStop(0, `rgba(255,230,160,${0.6 * fadeOut})`);
        g.addColorStop(1, "rgba(255,230,160,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, 6, 0, Math.PI * 2);
        c.fill();
      }
    }
    for (const r of this.rings) {
      if (r.delay > 0) continue;
      const k = r.life / r.max;
      c.strokeStyle = `rgba(${r.color.join(",")},${k})`;
      c.lineWidth = r.width;
      c.beginPath();
      if (r.arc) c.arc(r.x, r.y, r.r, r.arc[0], r.arc[1]);
      else c.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      c.stroke();
    }
    for (const p of this.parts) {
      if (p.delay > 0) continue;
      const k = p.life / p.max;
      c.globalCompositeOperation = p.glow ? "lighter" : "source-over";
      if (p.glow) {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(0.5, p.size));
        g.addColorStop(0, `rgba(${p.color.join(",")},${k})`);
        g.addColorStop(1, `rgba(${p.color.join(",")},0)`);
        c.fillStyle = g;
      } else c.fillStyle = `rgba(${p.color.join(",")},${k * 0.35})`;
      c.beginPath();
      c.arc(p.x, p.y, Math.max(0.3, p.size), 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = "lighter";
    for (const sp of this.sprites) {
      if (sp.delay > 0 || !sp.img.complete) continue;
      const f = Math.floor(sp.t * sp.fps);
      const { cols, size } = sp.sheet;
      const w = size * sp.scale;
      c.drawImage(
        sp.img,
        (f % cols) * size,
        Math.floor(f / cols) * size,
        size,
        size,
        sp.x - w / 2,
        sp.y - w / 2,
        w,
        w,
      );
    }
    c.globalCompositeOperation = "source-over";
    c.textAlign = "center";
    for (const t of this.texts) {
      if (t.delay > 0) continue;
      const k = Math.min(1, t.life / (t.max * 0.5));
      c.font = `bold ${t.size}px ui-monospace, monospace`;
      c.lineWidth = 3;
      c.strokeStyle = `rgba(0,0,0,${0.8 * k})`;
      c.strokeText(t.text, t.x, t.y);
      c.fillStyle = `rgba(${t.color.join(",")},${k})`;
      c.fillText(t.text, t.x, t.y);
    }
  }
}
