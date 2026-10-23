import { useEffect, useMemo, useRef, useState } from "react";
import shipLoyal from "@/assets/planet/ship-loyal-real.png";
import shipTraitor from "@/assets/planet/ship-traitor-real.png";
import medusa from "@/assets/bridge/medusa-texture.jpg";
import { ORDERS, OBJECTIVE_LABEL, type NavalOrder, type RaidReport, type RaidRound } from "@/lib/naval";
import { muted, preloadSfx, say, setMuted, sfx } from "@/lib/naval-audio";
import { NavalFx } from "@/components/ship/NavalFx";
import voidBg from "@/assets/naval/void-backdrop.jpg";
import { Button } from '@/components/ui/button';

const shipImg = (traitor: boolean) => (traitor ? shipTraitor : shipLoyal);

/** Trayectoria de la ofensiva: la nave sale de la órbita geoestacionaria hacia el objetivo. */
export function TrajectoryView({ createdAt, deadline, attackerTraitor, defenderTraitor, attackerName, defenderName, fresh, now, attackerImage, defenderImage }: {
  createdAt: string; deadline: string; attackerTraitor: boolean; defenderTraitor: boolean; attackerName: string; defenderName: string; fresh?: boolean; now: number; attackerImage?: string; defenderImage?: string;
}) {
  const t0 = new Date(createdAt).getTime(), t1 = new Date(deadline).getTime();
  const p = Math.min(Math.max((now - t0) / (t1 - t0), 0), 1);
  const [calc, setCalc] = useState(!!fresh);
  useEffect(() => { if (!fresh) return undefined; void preloadSfx().then(() => sfx.engines()); const t = setTimeout(() => setCalc(false), 4500); return () => clearTimeout(t); }, [fresh]);
  // Bézier cuadrática de la órbita (18,62) a la nave enemiga (86,30)
  const P0: [number, number] = [18, 62], P1: [number, number] = [45, 5], P2: [number, number] = [86, 30];
  const b = (k: 0 | 1, t: number) => (1 - t) ** 2 * P0[k] + 2 * (1 - t) * t * P1[k] + t * t * P2[k];
  const d = (k: 0 | 1, t: number) => 2 * (1 - t) * (P1[k] - P0[k]) + 2 * t * (P2[k] - P1[k]);
  const x = b(0, p), y = b(1, p), ang = Math.atan2(d(1, p) * 0.56, d(0, p)) * 180 / Math.PI;
  const ms = Math.max(t1 - now, 0);
  const hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000), ss = Math.floor((ms % 60000) / 1000);
  const dist = Math.round((1 - p) * 384400);
  const vec = (ang + 360).toFixed(1);
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden border border-border bg-background">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, currentColor, transparent), radial-gradient(1px 1px at 70% 80%, currentColor, transparent), radial-gradient(1px 1px at 40% 60%, currentColor, transparent), radial-gradient(1px 1px at 85% 15%, currentColor, transparent)", backgroundSize: "120px 90px" }} />
      <div className="absolute rounded-full" style={{ left: "-12%", top: "52%", width: "40%", aspectRatio: "1", backgroundImage: `url(${medusa})`, backgroundSize: "200% 100%", animation: "planet-spin 120s linear infinite", boxShadow: "inset -30px -10px 60px var(--background)" }} />
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <ellipse cx="8" cy="70" rx="22" ry="12" fill="none" stroke="var(--primary)" strokeOpacity=".35" strokeDasharray="1 1.5" strokeWidth=".3" />
        <path d={`M${P0[0]},${P0[1] * 0.56} Q${P1[0]},${P1[1] * 0.56} ${P2[0]},${P2[1] * 0.56}`} fill="none" stroke="var(--destructive)" strokeWidth=".35" strokeDasharray="1.5 1.5" style={{ animation: "nv-dash 2s linear infinite" }} opacity={calc ? 0.4 : 0.9} />
        <circle cx={P2[0]} cy={P2[1] * 0.56} r="5" fill="none" stroke="var(--destructive)" strokeWidth=".25" strokeDasharray="1 1" style={{ transformOrigin: `${P2[0]}px ${P2[1] * 0.56}px`, animation: "nv-scan 6s linear infinite" }} />
      </svg>
      <img src={defenderImage ?? shipImg(defenderTraitor)} alt={`Nave de ${defenderName}`} width={768} height={512} className="absolute w-[24%] -translate-x-1/2 -translate-y-1/2 mix-blend-screen" style={{ left: `${P2[0]}%`, top: `${P2[1]}%`, transform: "translate(-50%,-50%) scaleX(-1)", animation: "nv-float 5s ease-in-out infinite" }} />
      <img src={attackerImage ?? shipImg(attackerTraitor)} alt={`Nave de ${attackerName}`} width={768} height={512} className="absolute w-[24%] mix-blend-screen" style={{ left: `${calc ? P0[0] : x}%`, top: `${calc ? P0[1] : y}%`, transform: `translate(-50%,-50%) rotate(${calc ? 0 : ang}deg)`, transition: "left 4s ease-in, top 4s ease-in, transform 2s" }} />
      <div className="absolute left-2 top-2 space-y-0.5 bg-background/70 p-2 font-mono text-[10px] text-primary sm:text-xs">
        {calc ? (
          <p className="glow">CALCULANDO TRAYECTORIA<span style={{ animation: "blink 1s step-end infinite" }}>_</span></p>
        ) : (
          <>
            <p className="text-destructive">RUMBO FIJADO → {defenderName}</p>
            <p>DISTANCIA {dist.toLocaleString("es-ES")} km</p>
            <p>VECTOR {vec}° · {(p * 100).toFixed(1)} %</p>
            <p>CONTACTO EN {hh}h {String(mm).padStart(2, "0")}m {String(ss).padStart(2, "0")}s</p>
          </>
        )}
      </div>
    </div>
  );
}

type Fx = { key: number; side: "a" | "d"; order: NavalOrder; hits: number; crit: number };

/** Repetición animada del combate, ronda a ronda, con sonido. */
export function BattleReplay({ report, winner, attackerName, defenderName, attackerTraitor, defenderTraitor, mine, modNames, loot, onClose, attackerImage, defenderImage }: {
  report: RaidReport; winner: string | null; attackerName: string; defenderName: string; attackerTraitor: boolean; defenderTraitor: boolean;
  mine: boolean; modNames: Record<string, string>; loot: number; onClose: () => void; attackerImage?: string; defenderImage?: string;
}) {
  const rounds = report.rounds ?? [];
  const a0 = report.a_hull0 ?? Math.max(10, (rounds[0]?.a_hull ?? 10) + (rounds[0]?.d_hits ?? 0));
  const d0 = report.d_hull0 ?? Math.max(10, (rounds[0]?.d_hull ?? 10) + (rounds[0]?.a_hits ?? 0));
  const [step, setStep] = useState<{ title?: string | undefined; fx?: Fx | undefined; aHull: number; dHull: number; done?: boolean }>({ aHull: a0, dHull: d0 });
  const [mute, setMute] = useState(muted);
  const timers = useRef<number[]>([]);
  const words = ["uno", "dos", "tres", "cuatro", "cinco"];

  const script = useMemo(() => {
    const s: { at: number; run: () => void }[] = [];
    let t = 0;
    s.push({ at: t, run: () => { sfx.alarm(); setStep((x) => ({ ...x, title: "CONTACTO HOSTIL" })); } });
    t += 2200;
    let ah = a0, dh = d0;
    rounds.forEach((r: RaidRound, i) => {
      s.push({ at: t, run: () => { say(`Ronda ${words[i % 5] ?? i + 1}`); setStep((x) => ({ ...x, title: `BLOQUE ${r.block ?? Math.floor(i/5)+1} · RONDA ${r.round}`, fx: undefined })); } });
      t += 1800;
      const dhNext = r.d_hull, ahNext = r.a_hull;
      s.push({ at: t, run: () => { play(r.a_order); setStep((x) => ({ ...x, title: `${attackerName}: ${ORDERS[r.a_order].label}`, fx: { key: t, side: "a", order: r.a_order, hits: r.a_hits, crit: r.a_sixes ?? 0 } })); } });
      t += 1400;
      s.push({ at: t, run: () => { if (r.a_hits > 0) sfx.impact(); setStep((x) => ({ ...x, dHull: dhNext })); } });
      t += 1300;
      s.push({ at: t, run: () => { play(r.d_order); setStep((x) => ({ ...x, title: `${defenderName}: ${ORDERS[r.d_order].label}`, fx: { key: t, side: "d", order: r.d_order, hits: r.d_hits, crit: r.d_sixes ?? 0 } })); } });
      t += 1400;
      s.push({ at: t, run: () => { if (r.d_hits > 0) sfx.impact(); setStep((x) => ({ ...x, aHull: ahNext })); } });
      t += 1500;
      ah = ahNext; dh = dhNext;
    });
    s.push({ at: t, run: () => { const w = (winner === "atacante") === mine; say(w ? "Victoria" : "Derrota"); setStep((x) => ({ ...x, title: undefined, fx: undefined, done: true })); } });
    void ah; void dh;
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function play(o: NavalOrder) {
    if (o === "fuego") sfx.cannon(); else if (o === "escudos") sfx.shield(); else if (o === "lanza") sfx.lance(); else if (o === "abordaje") sfx.boarding(); else sfx.engines();
  }
  function start() {
    timers.current.forEach(clearTimeout);
    setStep({ aHull: a0, dHull: d0 });
    timers.current = script.map((s) => window.setTimeout(s.run, s.at));
  }
  useEffect(() => { void preloadSfx().then(start); return () => { timers.current.forEach(clearTimeout); window.speechSynthesis?.cancel(); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fx = step.fx;
  const won = (winner === "atacante") === mine;
  const crits = (list?: { module: string; lost_level?: boolean; saved?: boolean }[]) => (list ?? []);
  const shooterX = fx?.side === "a" ? 24 : 76, targetX = fx?.side === "a" ? 76 : 24;
  const hitTarget = fx && fx.hits > 0 && fx.order !== "escudos" && fx.order !== "evasion";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-2" role="dialog" aria-label="Repetición del combate naval">
      <div className="w-full max-w-5xl">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-display text-primary glow">Registro de combate · {attackerName} vs {defenderName}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setMuted(!mute); setMute(!mute); }}>{mute ? "🔇 Sonido" : "🔊 Silenciar"}</Button>
            <Button variant="outline" size="sm" onClick={start}>↻ Repetir</Button>
            <Button variant="outline" size="sm" onClick={onClose}>Cerrar ✕</Button>
            <Button variant="outline" size="sm" onClick={()=>{timers.current.forEach(clearTimeout);const last=rounds.at(-1);setStep({aHull:last?.a_hull??a0,dHull:last?.d_hull??d0,done:true});}}>Resultado</Button>
          </div>
        </div>
        <div className="relative aspect-[16/9] w-full overflow-hidden border border-border bg-background" key={hitTarget ? `cam${fx?.key}` : "cam"} style={{ animation: hitTarget ? "nv-shake .5s ease-in-out 1.15s 2" : undefined }}>
          <img src={voidBg} alt="" width={1600} height={912} className="absolute inset-0 h-full w-full scale-110 object-cover" style={{ animation: "nv-drift 40s ease-in-out infinite alternate" }} />
          <div className="pointer-events-none absolute inset-0 z-10" style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgb(0 0 0 / .85) 100%)" }} />
          <div className="pointer-events-none absolute inset-0 z-10 opacity-[.12] mix-blend-overlay" style={{ backgroundImage: "repeating-radial-gradient(circle at 17% 32%, #fff 0 1px, transparent 1px 3px)", animation: "nv-grain .4s steps(2) infinite" }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[7%] bg-black" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[7%] bg-black" />
          {hitTarget && <div key={`x${fx?.key}`} className="pointer-events-none absolute z-10 h-[40%] w-[25%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${targetX}%`, top: "50%", background: "radial-gradient(circle, #fff6d0 0%, #ff9a2e 30%, #b3260f 60%, transparent 75%)", opacity: 0, animation: "nv-flash 1s ease-out 1.1s" }} />}
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(1px 1px at 10% 20%, currentColor, transparent), radial-gradient(1px 1px at 60% 70%, currentColor, transparent), radial-gradient(1px 1px at 35% 85%, currentColor, transparent), radial-gradient(1px 1px at 90% 40%, currentColor, transparent)", backgroundSize: "140px 100px" }} />
          {/* Naves */}
          {(["a", "d"] as const).map((side) => {
            const x = side === "a" ? 24 : 76;
            const own = fx?.side === side;
            const hit = hitTarget && fx?.side !== side;
            const anim = own && fx?.order === "evasion" ? "nv-evade 1.4s ease-in-out" : hit ? "nv-shake .6s ease-in-out 1.1s 2" : "nv-float 4s ease-in-out infinite";
            return (
              <div key={side} className="absolute top-1/2 w-[30%]" style={{ left: `${x}%`, transform: "translate(-50%,-50%)" }}>
                <img src={(side === 'a' ? attackerImage : defenderImage) ?? shipImg(side === "a" ? attackerTraitor : defenderTraitor)} alt={`Nave de ${side === 'a' ? attackerName : defenderName}`} width={768} height={512} key={`${fx?.key}-${side}`}
                  className="w-full mix-blend-screen" style={{ transform: side === "d" ? "scaleX(-1)" : undefined, animation: anim }} />
                {own && fx?.order === "escudos" && <div className="absolute inset-[-12%] rounded-full border-2 border-primary" style={{ boxShadow: "0 0 40px var(--primary), inset 0 0 40px var(--primary)", animation: "nv-shield 1.2s ease-in-out 2" }} />}
                {hit && <div key={`f${fx?.key}`} className="absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive" style={{ filter: "blur(10px)", opacity: 0, animation: "nv-flash .8s ease-out 1.1s" }} />}
                {hit && <span key={`n${fx?.key}`} className="absolute left-1/2 top-0 font-display text-2xl text-destructive glow" style={{ opacity: 0, animation: "nv-rise 1.4s ease-out 1.2s" }}>−{fx?.hits}{fx && fx.crit > 0 ? " ¡CRÍTICO!" : ""}</span>}
              </div>
            );
          })}
          {/* Efectos de la orden */}
          {fx && <NavalFx fxKey={fx.key} order={fx.order} from={shooterX} to={targetX} hit={!!hitTarget} color={(fx.side === "a" ? attackerTraitor : defenderTraitor) ? "var(--traitor)" : "var(--loyal)"} />}
          {/* Casco */}
          {(["a", "d"] as const).map((side) => {
            const hull = side === "a" ? step.aHull : step.dHull, max = side === "a" ? a0 : d0;
            return (
              <div key={`h${side}`} className={`absolute bottom-[8%] z-30 w-[38%] text-[10px] sm:text-xs ${side === "a" ? "left-3" : "right-3 text-right"}`}>
                <p className="truncate">{side === "a" ? attackerName : defenderName} · casco {Math.max(hull, 0)}/{max}</p>
                <div className="mt-1 h-2 border border-border"><div className="h-full bg-primary transition-all duration-700" style={{ width: `${Math.max(hull, 0) / max * 100}%`, marginLeft: side === "d" ? "auto" : undefined }} /></div>
              </div>
            );
          })}
          {step.title && <p key={step.title} className="absolute left-0 right-0 top-[9%] z-30 text-center font-display text-lg uppercase text-primary glow sm:text-3xl" style={{ animation: "nv-title 1.8s ease-out forwards" }}>{step.title}</p>}
          {step.done && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-background/85 p-4 text-center">
              <p className={`font-display text-3xl sm:text-5xl ${won ? "text-primary glow" : "text-destructive"}`}>{!winner ? 'ENFRENTADOS' : winner === 'empate' ? 'EMPATE' : won ? "VICTORIA" : "DERROTA"}</p>
              {winner && winner !== 'empate' && <p className="mt-2 text-sm">Vence {winner === "atacante" ? attackerName : defenderName}</p>}
              <p className="mt-1 text-sm text-primary">{OBJECTIVE_LABEL[report.objective ?? (winner === "atacante" ? "saqueo" : "defensa")]}{loot > 0 ? ` · ${loot} créditos saqueados` : ""}</p>
              <div className="mt-4 grid w-full max-w-2xl gap-3 text-left text-xs sm:grid-cols-2">
                {([["Nave atacante", report.attacker_crits], ["Nave defensora", report.defender_crits]] as const).map(([lbl, list]) => (
                  <div key={lbl} className="border border-border p-2">
                    <p className="mb-1 text-muted-foreground">{lbl}</p>
                    {crits(list).length === 0 ? <p>Sin daños críticos</p> : crits(list).map((c, i) => (
                      <p key={i} className={c.saved ? "text-primary" : c.lost_level ? "text-destructive" : ""}>
                        {c.saved ? "✓ Crítico anulado por la Forja" : c.lost_level ? `✖ ${modNames[c.module] ?? c.module}: destruido (−1 nivel)` : `⚠ ${modNames[c.module] ?? c.module}: averiado`}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
