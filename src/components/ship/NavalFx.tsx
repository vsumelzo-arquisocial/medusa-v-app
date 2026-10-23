import type { CSSProperties } from "react";
import type { NavalOrder } from "@/lib/naval";

/** Efectos cinematográficos de cada orden: láseres, lanza, cápsulas de abordaje, explosiones y metralla. */
export function NavalFx({ fxKey, order, from, to, hit, color }: {
  fxKey: number; order: NavalOrder; from: number; to: number; hit: boolean; color: string;
}) {
  const dir = to > from ? 1 : -1;
  const v = (o: Record<string, string | number>) => o as CSSProperties;
  const els: React.ReactNode[] = [];

  if (order === "fuego") {
    // Andanada: 3 oleadas de baterías láser desde distintos puntos del casco
    for (let i = 0; i < 18; i++) {
      const y0 = 42 + ((i * 37) % 17), y1 = 44 + ((i * 53) % 13), d = (i % 6) * 0.09 + Math.floor(i / 6) * 0.55;
      els.push(<span key={`m${i}`} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={v({ left: `${from + dir * 6}%`, top: `${y0}%`, background: `radial-gradient(circle, #fff, ${color} 50%, transparent 70%)`, opacity: 0, animation: `nv-muzzle .18s ease-out ${d}s` })} />);
      els.push(<span key={`b${i}`} className="absolute h-[3px] w-[9%] -translate-y-1/2 rounded-full" style={v({ "--x0": `${from + dir * 6}%`, "--x1": `${to - dir * 4}%`, "--y0": `${y0}%`, "--y1": `${y1}%`, left: 0, top: 0, background: `linear-gradient(${dir > 0 ? 90 : 270}deg, transparent, ${color} 60%, #fff)`, boxShadow: `0 0 10px ${color}, 0 0 20px ${color}`, opacity: 0, animation: `nv-bolt .42s linear ${d + 0.05}s` })} />);
      if (hit) els.push(<Boom key={`x${i}`} x={to + ((i * 7) % 9) - 4} y={y1} size={6 + (i % 3) * 2} delay={d + 0.47} />);
    }
  }

  if (order === "lanza") {
    els.push(<span key="charge" className="absolute h-[18%] w-[10%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={v({ left: `${from + dir * 9}%`, top: "50%", background: "radial-gradient(circle, #fff 0%, var(--primary) 35%, transparent 70%)", opacity: 0, animation: "nv-charge 1s ease-in" })} />);
    els.push(<div key="beam" className="absolute top-1/2 -translate-y-1/2" style={v({ left: `${Math.min(from, to) + 6}%`, width: `${Math.abs(to - from) - 8}%`, height: "3.5%", transformOrigin: dir > 0 ? "left" : "right", background: "linear-gradient(180deg, transparent, var(--primary) 30%, #fff 50%, var(--primary) 70%, transparent)", boxShadow: "0 0 30px var(--primary), 0 0 80px var(--primary)", opacity: 0, animation: "nv-lance 1.2s ease-out .9s forwards" })} />);
    if (hit) [0, 0.15, 0.3, 0.5].forEach((d, i) => els.push(<Boom key={`lx${i}`} x={to + (i - 1.5) * 3} y={46 + (i % 2) * 8} size={14 + i * 3} delay={1.05 + d} />));
  }

  if (order === "abordaje") {
    // Cápsulas de asalto con estela de motor en trayectoria curva
    for (let i = 0; i < 6; i++) {
      const y0 = 44 + (i % 3) * 5, arc = (i % 2 ? -1 : 1) * (8 + i * 2), d = i * 0.18;
      els.push(
        <span key={`p${i}`} className="absolute" style={v({ "--x0": `${from + dir * 5}%`, "--x1": `${to - dir * 3}%`, "--y0": `${y0}%`, "--y1": `${46 + i * 1.5}%`, "--arc": `${arc}%`, left: 0, top: 0, opacity: 0, animation: `nv-pod 1.4s cubic-bezier(.5,0,.8,1) ${d}s` })}>
          <span className="relative block h-[6px] w-[16px] rounded-full bg-muted-foreground" style={{ transform: dir < 0 ? "scaleX(-1)" : undefined, boxShadow: "0 0 4px #000" }}>
            <span className="absolute top-1/2 h-[4px] w-[34px] -translate-y-1/2 rounded-full" style={{ right: "100%", background: "linear-gradient(90deg, transparent, #ffb347, #fff)", filter: "blur(1px)", animation: "nv-flame .08s linear infinite alternate" }} />
          </span>
        </span>,
      );
      if (hit) els.push(<Boom key={`px${i}`} x={to - dir * 3} y={46 + i * 1.5} size={7} delay={d + 1.4} />);
    }
  }

  if (order === "evasion") {
    els.push(<span key="thr" className="absolute h-[6%] w-[16%] -translate-y-1/2" style={v({ left: dir > 0 ? `${from - 22}%` : `${from + 6}%`, top: "50%", background: `linear-gradient(${dir > 0 ? 90 : 270}deg, transparent, #ffb347, #fff)`, filter: "blur(3px)", opacity: 0, animation: "nv-charge 1.4s ease-out" })} />);
  }

  return <div key={fxKey} className="pointer-events-none absolute inset-0 z-[5]">{els}</div>;
}

function Boom({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  return (
    <span className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: `${size * 0.6}vmin`, height: `${size * 0.6}vmin`, background: "radial-gradient(circle, #fff8e0 0%, #ffb347 28%, #d4380d 55%, rgb(40 20 10 / .6) 70%, transparent 75%)", opacity: 0, animation: `nv-boom .7s ease-out ${delay}s` }} />
      {Array.from({ length: 5 }).map((_, k) => (
        <span key={k} className="absolute h-[2px] w-[2px] rounded-full" style={{ background: "#ffd27a", boxShadow: "0 0 4px #ff8a00", ["--dx" as string]: `${Math.cos(k * 1.3 + x) * size * 0.9}vmin`, ["--dy" as string]: `${Math.sin(k * 1.3 + y) * size * 0.9}vmin`, opacity: 0, animation: `nv-spark .8s ease-out ${delay + 0.05}s` }} />
      ))}
    </span>
  );
}
