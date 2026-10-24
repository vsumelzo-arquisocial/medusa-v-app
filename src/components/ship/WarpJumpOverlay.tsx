import { useEffect, useRef } from "react";

const DURATION = 4800;

/**
 * Animación de salto al warp a pantalla completa (≈4,8 s):
 * la nave avanza, se abre una grieta warp violeta/verde con relámpagos, la nave se estira hacia ella
 * y desaparece en un destello blanco. Con "reducir movimiento" se sustituye por un fundido breve.
 */
export function WarpJumpOverlay({
  shipImage,
  destination,
  onDone,
}: {
  shipImage: string;
  destination: string;
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
      H = 900;
    c.width = W;
    c.height = H;
    const stars = Array.from({ length: 220 }, (_, i) => ({
      x: (i * 397.13) % W,
      y: (i * 211.71) % H,
      s: 0.4 + ((i * 7) % 10) / 6,
    }));
    const bolts: { a: number; life: number; seed: number }[] = [];
    let frame = 0,
      stopped = false;
    const start = performance.now();
    const riftX = W * 0.72,
      riftY = H * 0.5;

    const ease = (t: number) => t * t * (3 - 2 * t);
    const clamp = (v: number) => Math.max(0, Math.min(1, v));

    const draw = (now: number) => {
      if (stopped) return;
      const ms = now - start;
      const t = ms / 1000;
      const open = ease(clamp((ms - 500) / 1300)); // la grieta se abre
      const pull = ease(clamp((ms - 1700) / 1700)); // la nave es absorbida
      const flash = clamp((ms - 3300) / 500) - clamp((ms - 4000) / 800); // destello

      // Espacio con estrellas que se alargan al acelerar
      ctx.fillStyle = "#04050a";
      ctx.fillRect(0, 0, W, H);
      const speed = 1 + pull * 40;
      for (const st of stars) {
        const x = (st.x - t * 30 * st.s * speed + W * 10) % W;
        ctx.globalAlpha = 0.35 + st.s * 0.25;
        ctx.fillStyle = "#cfd8ff";
        ctx.fillRect(x, st.y, Math.max(1, st.s * speed * 1.5), Math.max(1, st.s));
      }
      ctx.globalAlpha = 1;

      // Grieta warp: remolino elíptico violeta y verde
      if (open > 0) {
        const rx = 40 + open * 230,
          ry = 30 + open * 330;
        ctx.save();
        ctx.translate(riftX, riftY);
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, ry * 1.4);
        glow.addColorStop(0, `rgba(255,255,255,${0.9 * open})`);
        glow.addColorStop(0.15, `rgba(196,120,255,${0.85 * open})`);
        glow.addColorStop(0.45, `rgba(110,40,200,${0.55 * open})`);
        glow.addColorStop(0.7, `rgba(40,220,140,${0.25 * open})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * 1.5, ry * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Brazos del remolino
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < 14; i++) {
          const a0 = t * (1.6 + (i % 3) * 0.4) + (i * Math.PI * 2) / 14;
          ctx.strokeStyle =
            i % 2 ? `rgba(170,90,255,${0.55 * open})` : `rgba(80,255,170,${0.35 * open})`;
          ctx.lineWidth = 3 + (i % 4);
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            rx * (0.35 + (i % 5) * 0.14),
            ry * (0.35 + (i % 5) * 0.14),
            0,
            a0,
            a0 + 1.2,
          );
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalCompositeOperation = "source-over";

        // Relámpagos warp
        if (Math.random() < 0.18 * open)
          bolts.push({ a: Math.random() * Math.PI * 2, life: 1, seed: Math.random() * 1000 });
        for (let b = bolts.length - 1; b >= 0; b--) {
          const bolt = bolts[b];
          if (!bolt) continue;
          bolt.life -= 0.08;
          if (bolt.life <= 0) {
            bolts.splice(b, 1);
            continue;
          }
          ctx.strokeStyle = `rgba(220,190,255,${bolt.life})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          let x = riftX,
            y = riftY;
          ctx.moveTo(x, y);
          for (let k = 1; k <= 7; k++) {
            const r = (k / 7) * (ry * 1.1);
            const jitter = Math.sin(bolt.seed + k * 12.9) * 0.35;
            x = riftX + Math.cos(bolt.a + jitter) * r * (rx / ry);
            y = riftY + Math.sin(bolt.a + jitter) * r;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Nave: avanza, se estira y entra en la grieta
      if (ship.complete && ship.naturalWidth && pull < 1) {
        const baseW = 640,
          baseH = (ship.naturalHeight / ship.naturalWidth) * baseW;
        const cruise = Math.min(1, ms / 1700) * 80;
        const x0 = W * 0.24 + cruise;
        const x = x0 + (riftX - x0 - baseW * 0.15) * pull;
        const stretch = 1 + pull * 2.2;
        const squash = 1 - pull * 0.85;
        ctx.save();
        ctx.globalAlpha = 1 - pull * 0.9;
        // "lighten" oculta el fondo negro de la ilustración de la nave.
        ctx.globalCompositeOperation = "lighten";
        ctx.translate(x, riftY + Math.sin(t * 2) * 4 * (1 - pull));
        ctx.scale(stretch * (1 - pull * 0.6), squash);
        ctx.drawImage(ship, -baseW / 2, -baseH / 2, baseW, baseH);
        ctx.restore();
        // Estela de motores
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const flame = ctx.createLinearGradient(x - 420, riftY, x - 120, riftY);
        flame.addColorStop(0, "rgba(0,0,0,0)");
        flame.addColorStop(1, `rgba(150,220,255,${0.6 * (1 - pull)})`);
        ctx.fillStyle = flame;
        ctx.fillRect(x - 420 - pull * 300, riftY - 14, 300 + pull * 300, 28);
        ctx.restore();
      }

      // Destello blanco final
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flash)})`;
        ctx.fillRect(0, 0, W, H);
      }

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
      aria-label={`Saltando al warp rumbo a ${destination}`}
    >
      <canvas ref={canvas} className="h-full w-full object-cover" aria-hidden="true" />
      <p className="absolute inset-x-0 bottom-10 text-center font-display text-lg uppercase tracking-[0.3em] text-white/80">
        Salto al warp · rumbo a {destination}
      </p>
    </div>
  );
}
