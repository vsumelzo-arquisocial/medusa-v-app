import { useEffect, useRef } from "react";

const DURATION = 3200;

/**
 * Animación de salto anulado (≈3,2 s): alarma roja dentro del túnel warp, la nave frena,
 * gira sobre sí misma y las estelas del warp invierten su sentido.
 * Con "reducir movimiento" se sustituye por un aviso breve.
 */
export function AbortJumpOverlay({
  shipImage,
  origin,
  onDone,
}: {
  shipImage: string;
  origin: string;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const t = setTimeout(() => done.current(), 900);
      return () => clearTimeout(t);
    }
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) {
      done.current();
      return;
    }
    const ship = new Image();
    ship.src = shipImage;
    const W = 1600,
      H = 900,
      cx = W / 2,
      cy = H / 2;
    c.width = W;
    c.height = H;
    const streaks = Array.from({ length: 160 }, (_, i) => ({
      y: (i * 211.71) % H,
      x: (i * 397.13) % W,
      len: 60 + ((i * 37) % 180),
      v: 0.6 + ((i * 13) % 10) / 8,
    }));
    let frame = 0,
      stopped = false,
      offset = 0,
      last = performance.now();
    const start = last;
    const ease = (t: number) => t * t * (3 - 2 * t);
    const clamp = (v: number) => Math.max(0, Math.min(1, v));

    const draw = (now: number) => {
      if (stopped) return;
      const ms = now - start;
      const dt = (now - last) / 1000;
      last = now;
      const turn = ease(clamp((ms - 700) / 1400)); // giro de la nave
      // Velocidad de las estelas: frena, se detiene y avanza en sentido contrario.
      const speed =
        ms < 700 ? 1 - ms / 900 : -ease(clamp((ms - 1400) / 1200)) * 1.4 + (1 - turn) * 0.2;
      offset += speed * 1400 * dt;

      // Túnel warp violeta
      const bg = ctx.createRadialGradient(cx, cy, 50, cx, cy, W * 0.7);
      bg.addColorStop(0, "#2b0f4a");
      bg.addColorStop(0.6, "#120624");
      bg.addColorStop(1, "#05020a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "screen";
      for (const s of streaks) {
        const x = (((s.x - offset * s.v) % W) + W) % W;
        ctx.strokeStyle = `rgba(190,130,255,${0.25 + s.v * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, s.y);
        ctx.lineTo(x + s.len * Math.sign(speed || 1), s.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      // Nave girando 180° (escala horizontal 1 → -1)
      if (ship.complete && ship.naturalWidth) {
        const bw = 620,
          bh = (ship.naturalHeight / ship.naturalWidth) * bw;
        const sx = Math.cos(turn * Math.PI);
        ctx.save();
        ctx.globalCompositeOperation = "lighten";
        ctx.translate(cx, cy + Math.sin(ms / 300) * 4);
        ctx.scale(
          Math.abs(sx) < 0.08 ? 0.08 * Math.sign(sx || 1) : sx,
          1 - Math.sin(turn * Math.PI) * 0.12,
        );
        ctx.drawImage(ship, -bw / 2, -bh / 2, bw, bh);
        ctx.restore();
        // Retropropulsores
        const flare = Math.sin(turn * Math.PI);
        if (flare > 0.05) {
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260 * flare);
          g.addColorStop(0, `rgba(255,220,180,${0.55 * flare})`);
          g.addColorStop(1, "rgba(255,120,60,0)");
          ctx.fillStyle = g;
          ctx.fillRect(cx - 300, cy - 300, 600, 600);
          ctx.restore();
        }
      }

      // Alarma roja intermitente
      const alarm = Math.floor(ms / 350) % 2 === 0 ? 0.28 : 0.08;
      ctx.fillStyle = `rgba(255,30,30,${alarm * (1 - clamp((ms - 2600) / 600))})`;
      ctx.fillRect(0, 0, W, H);

      if (ms >= DURATION) {
        stopped = true;
        done.current();
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [shipImage]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black"
      role="status"
      aria-live="assertive"
      aria-label={`Salto anulado: regresando a ${origin}`}
    >
      <canvas ref={canvas} className="h-full w-full object-cover" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-10 text-center">
        <p className="font-display text-lg uppercase tracking-[0.3em] text-red-300">
          Salto anulado
        </p>
        <p className="mt-1 text-sm uppercase tracking-[0.25em] text-white/80">
          Invirtiendo rumbo · regreso a {origin}
        </p>
      </div>
    </div>
  );
}
