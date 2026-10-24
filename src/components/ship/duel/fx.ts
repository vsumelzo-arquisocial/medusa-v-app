/**
 * Efectos de partículas en canvas para el auspex (coordenadas 320×320, como el SVG del radar).
 * Lanzas, andanadas, torpedos con estela, escudos, explosiones, embestidas, saltos disformes y motores.
 * Si la biblioteca tiene hojas de sprites de explosiones reales, se dibujan encima.
 */
import { SPRITES, type SpriteSheet } from "@/lib/sfx/library";

export interface P {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: [number, number, number];
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
  color: [number, number, number];
  delay: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  color: [number, number, number];
  width: number;
  delay: number;
  arc?: [number, number];
}

interface Missile {
  from: P;
  to: P;
  t: number;
  dur: number;
  delay: number;
  wobble: number;
  hit: boolean;
  color: [number, number, number];
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

export class FxEngine {
  private ctx: CanvasRenderingContext2D;
  private parts: Particle[] = [];
  private beams: Beam[] = [];
  private rings: Ring[] = [];
  private missiles: Missile[] = [];
  private sprites: SpriteFx[] = [];
  private raf = 0;
  private last = 0;
  private scale = 1;
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

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.draw();
      if (
        this.parts.length ||
        this.beams.length ||
        this.rings.length ||
        this.missiles.length ||
        this.sprites.length ||
        this.shake > 0.01
      )
        this.raf = requestAnimationFrame(loop);
      else {
        this.raf = 0;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ───── Emisores ─────

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
        life: max,
        max,
        size: o.size ?? 2,
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

  explosion(at: P, power = 1, delay = 0) {
    this.burst(
      at,
      Math.round(14 * power),
      { speed: [10, 70 * power], size: 1.6, color: [255, 220, 150], max: 0.5, drag: 3 },
      delay,
    );
    this.burst(
      at,
      Math.round(10 * power),
      {
        speed: [4, 25 * power],
        size: 5 * power,
        color: [255, 120, 40],
        max: 0.7,
        drag: 2,
        grow: 6,
      },
      delay,
    );
    this.burst(
      at,
      Math.round(8 * power),
      {
        speed: [2, 12],
        size: 6 * power,
        color: [90, 80, 80],
        max: 1.6,
        drag: 1,
        grow: 10,
        glow: false,
      },
      delay + 0.1,
    );
    this.rings.push({
      x: at.x,
      y: at.y,
      r: 2,
      vr: 70 * power,
      life: 0.35,
      max: 0.35,
      color: [255, 230, 190],
      width: 2,
      delay,
    });
    this.sprite(power > 1.5 ? "explosion_grande" : "explosion", at, 0.25 * power, delay);
    this.shake = Math.max(this.shake, 2 * power);
    this.kick();
  }

  destruction(at: P, delay = 0) {
    for (let i = 0; i < 5; i++)
      this.explosion({ x: at.x + rand(-10, 10), y: at.y + rand(-10, 10) }, 1.2, delay + i * 0.25);
    this.rings.push({
      x: at.x,
      y: at.y,
      r: 4,
      vr: 160,
      life: 1.1,
      max: 1.1,
      color: [180, 220, 255],
      width: 3,
      delay: delay + 1.2,
    });
    this.burst(
      at,
      60,
      { speed: [30, 140], size: 1.8, color: [255, 240, 200], max: 1.4, drag: 1 },
      delay + 1.2,
    );
    this.burst(
      at,
      20,
      { speed: [5, 40], size: 8, color: [70, 60, 60], max: 3, drag: 0.6, grow: 14, glow: false },
      delay + 1.3,
    );
    this.sprite("explosion_grande", at, 0.6, delay + 1.2);
    this.shake = 8;
    this.kick();
  }

  lance(from: P, to: P, color: [number, number, number] = [140, 220, 255], delay = 0) {
    this.beams.push({ a: from, b: to, life: 0.45, max: 0.45, width: 3, color, delay });
    this.beams.push({
      a: from,
      b: to,
      life: 0.25,
      max: 0.25,
      width: 7,
      color,
      delay: delay + 0.05,
    });
    this.burst(
      to,
      18,
      { speed: [10, 60], size: 1.5, color: [255, 255, 255], max: 0.4 },
      delay + 0.05,
    );
    this.burst(from, 6, { speed: [5, 20], size: 2, color, max: 0.3 }, delay);
    this.kick();
  }

  battery(
    from: P,
    to: P,
    shots: number,
    color: [number, number, number] = [255, 190, 90],
    delay = 0,
  ) {
    const n = Math.max(4, Math.min(16, shots * 2));
    for (let i = 0; i < n; i++) {
      const d = delay + i * 0.07 + rand(0, 0.05);
      const off = { x: from.x + rand(-6, 6), y: from.y + rand(-6, 6) };
      const tgt = { x: to.x + rand(-8, 8), y: to.y + rand(-8, 8) };
      this.missiles.push({
        from: off,
        to: tgt,
        t: 0,
        dur: rand(0.25, 0.4),
        delay: d,
        wobble: 0,
        hit: true,
        color,
      });
      this.burst(off, 3, { speed: [10, 30], size: 1.4, color: [255, 230, 160], max: 0.15 }, d);
    }
    this.kick();
  }

  torpedoes(from: P, to: P, n: number, hits: number, delay = 0, dur = 1.1) {
    for (let i = 0; i < n; i++) {
      const tgt =
        i < hits
          ? { x: to.x + rand(-4, 4), y: to.y + rand(-4, 4) }
          : { x: to.x + rand(-28, 28), y: to.y + rand(-28, 28) };
      this.missiles.push({
        from: { x: from.x + rand(-4, 4), y: from.y + rand(-4, 4) },
        to: tgt,
        t: 0,
        dur: dur + rand(-0.15, 0.2),
        delay: delay + i * 0.08,
        wobble: rand(-14, 14),
        hit: i < hits,
        color: [255, 210, 120],
      });
    }
    this.kick();
  }

  /** Salva lanzada que impactará en la fase siguiente: viaja parte del camino. */
  launch(from: P, to: P, n: number, delay = 0) {
    for (let i = 0; i < n; i++) {
      const k = 0.35 + i * 0.03;
      const tgt = {
        x: from.x + (to.x - from.x) * k + rand(-5, 5),
        y: from.y + (to.y - from.y) * k + rand(-5, 5),
      };
      this.missiles.push({
        from: { x: from.x + rand(-3, 3), y: from.y + rand(-3, 3) },
        to: tgt,
        t: 0,
        dur: 0.9,
        delay: delay + i * 0.08,
        wobble: rand(-6, 6),
        hit: false,
        color: [255, 210, 120],
      });
    }
    this.burst(from, 12, { speed: [10, 40], size: 2, color: [255, 220, 170], max: 0.4 }, delay);
    this.kick();
  }

  shield(at: P, from: P, delay = 0) {
    const ang = Math.atan2(from.y - at.y, from.x - at.x);
    this.rings.push({
      x: at.x,
      y: at.y,
      r: 14,
      vr: 6,
      life: 0.6,
      max: 0.6,
      color: [110, 190, 255],
      width: 3,
      delay,
      arc: [ang - 0.9, ang + 0.9],
    });
    this.burst(
      { x: at.x + Math.cos(ang) * 14, y: at.y + Math.sin(ang) * 14 },
      10,
      { speed: [10, 40], size: 1.4, color: [160, 220, 255], max: 0.35 },
      delay,
    );
    this.kick();
  }

  ram(at: P, delay = 0) {
    this.burst(
      at,
      40,
      { speed: [20, 110], size: 1.6, color: [255, 230, 160], max: 0.7, drag: 2 },
      delay,
    );
    this.explosion(at, 1.4, delay + 0.05);
    this.shake = 7;
    this.kick();
  }

  engines(at: P, heading: number, strong: boolean, delay = 0) {
    const back = heading + Math.PI / 2; // heading en radianes en el canvas (0 = arriba)
    this.burst(
      at,
      strong ? 26 : 8,
      {
        speed: [20, strong ? 70 : 35],
        size: strong ? 3 : 2,
        color: strong ? [120, 190, 255] : [255, 170, 90],
        max: strong ? 0.8 : 0.5,
        dir: back,
        spread: 0.25,
        drag: 1.5,
        grow: 2,
      },
      delay,
    );
    this.kick();
  }

  warp(at: P, success: boolean, delay = 0) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 34;
      const p = { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
      this.parts.push({
        x: p.x,
        y: p.y,
        vx: -Math.cos(a) * 40 - Math.sin(a) * 50,
        vy: -Math.sin(a) * 40 + Math.cos(a) * 50,
        life: 1.2,
        max: 1.2,
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
      r: 40,
      vr: -30,
      life: 1.2,
      max: 1.2,
      color: [210, 140, 255],
      width: 2,
      delay,
    });
    if (success)
      this.rings.push({
        x: at.x,
        y: at.y,
        r: 2,
        vr: 120,
        life: 0.5,
        max: 0.5,
        color: [255, 220, 255],
        width: 4,
        delay: delay + 1.3,
      });
    else this.explosion(at, 0.8, delay + 1.2);
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
    this.missiles = keep(this.missiles, (m) => {
      m.t += dt / m.dur;
      const p = this.missilePos(m);
      if (m.dur > 0.6)
        this.parts.push({
          x: p.x,
          y: p.y,
          vx: rand(-4, 4),
          vy: rand(-4, 4),
          life: 0.6,
          max: 0.6,
          size: 1.6,
          color: [180, 170, 160],
          drag: 1,
          grow: 3,
          glow: false,
          delay: 0,
        });
      if (m.t >= 1) {
        if (m.hit) {
          if (m.dur > 0.6) this.explosion(m.to, 0.7);
          else
            this.burst(m.to, 5, { speed: [10, 40], size: 1.5, color: [255, 200, 120], max: 0.3 });
        }
        return false;
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
      c.fillStyle = `rgb(${m.color.join(",")})`;
      c.beginPath();
      c.arc(p.x, p.y, m.dur > 0.6 ? 2.2 : 1.4, 0, Math.PI * 2);
      c.fill();
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
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
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
  }
}
