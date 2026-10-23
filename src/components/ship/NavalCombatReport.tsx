import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ORDERS, OBJECTIVE_LABEL, type RaidReport } from "@/lib/naval";
import { LogOut, ShieldOff, TimerOff, Swords, FileText } from "lucide-react";

interface Props {
  report: RaidReport; winner: string | null; status: string; loot: number; mine: boolean;
  attackerName: string; defenderName: string; attackerImage: string; defenderImage: string;
  theme: string; onClose: () => void;
}

function HullBar({ name, hull, initial }: { name: string; hull: number | undefined; initial: number | undefined }) {
  const percent = hull != null && initial != null && initial > 0 ? Math.round(Math.max(0, hull / initial) * 100) : null;
  return <div className="min-w-0 space-y-1.5">
    <div className="flex flex-wrap justify-between gap-x-2 text-xs"><span>Casco {hull ?? "no registrado"}</span>{percent != null && <span className="text-muted-foreground">{percent} % del inicial</span>}</div>
    {percent != null ? <Progress aria-label={`Casco de ${name}`} value={Math.min(100, percent)} className={hull === 0 ? "bg-destructive/20 [&>div]:bg-destructive [&>div]:transition-none" : "[&>div]:transition-none"} /> : <p className="text-xs text-muted-foreground">Barra no disponible: casco inicial no registrado.</p>}
  </div>;
}

export function NavalCombatReport({ report, winner, status, loot, mine, attackerName, defenderName, attackerImage, defenderImage, theme, onClose }: Props) {
  const rounds = report.rounds ?? [];
  const last = rounds.at(-1);
  const loserName = winner === "atacante" ? defenderName : winner === "defensor" ? attackerName : null;
  const winnerName = winner === "atacante" ? attackerName : winner === "defensor" ? defenderName : null;
  const cancelled = status === "anulado";
  const title = cancelled ? "Combate anulado" : winner === "empate" ? "Empate" : winnerName ? `${(winner === "atacante") === mine ? "Victoria" : "Derrota"} · ${winnerName}` : "Resultado no registrado";
  const reason = cancelled ? "El combate fue anulado." : report.objective === "retirada_warp" && loserName ? `${loserName} saltó al warp y se retiró del combate. Conserva su nave.` : report.objective === "silencio" && loserName ? `${loserName} no confirmó la continuación antes del plazo de 24 horas.` : report.objective === "casco" ? winner === "empate" ? "Ambas naves quedaron con el casco a cero: empate por incapacitación mutua." : `${loserName ?? "La nave derrotada"} quedó con el casco a cero y fue incapacitada. La nave no se pierde permanentemente.` : OBJECTIVE_LABEL[report.objective ?? ""] ?? "El motivo del desenlace no quedó registrado.";
  const ResultIcon = report.objective === "retirada_warp" ? LogOut : report.objective === "silencio" ? TimerOff : report.objective === "casco" ? ShieldOff : FileText;
  const ships = [
    { name: attackerName, image: attackerImage, initial: report.a_hull0, final: last?.a_hull ?? report.a_hull0, role: "Atacante", damage: rounds.reduce((n, r) => n + r.a_hits, 0) },
    { name: defenderName, image: defenderImage, initial: report.d_hull0, final: last?.d_hull ?? report.d_hull0, role: "Defensor", damage: rounds.reduce((n, r) => n + r.d_hits, 0) },
  ];
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={`${theme} max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto`}>
      <DialogHeader><DialogTitle className="pr-6 text-primary">Informe de combate espacial</DialogTitle><DialogDescription>{attackerName} contra {defenderName}</DialogDescription></DialogHeader>
      <section className="space-y-2 border-y border-border py-4">
        <h3 className={`flex items-center gap-2 font-semibold ${cancelled || winner === "empate" ? "text-muted-foreground" : (winner === "atacante") === mine ? "text-primary" : "text-destructive"}`}><ResultIcon className="h-5 w-5 shrink-0" />{title}</h3>
        <p className="text-sm">{reason}</p><p className="text-xs text-muted-foreground">Transferencia: {loot} cr{winnerName && loot > 0 ? ` a ${winnerName}` : ""} · {rounds.length} rondas registradas</p>
      </section>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{ships.map(ship => <section key={ship.role} className="min-w-0">
        <img src={ship.image} alt={`Nave de ${ship.name}`} className="h-28 w-full object-contain" width={768} height={512} />
        <h3 className="mb-2 break-words text-sm font-semibold text-primary">{ship.name} <span className="font-normal text-muted-foreground">· {ship.role}</span></h3>
        <HullBar name={ship.name} hull={ship.final} initial={ship.initial} />
        <p className="mt-2 text-xs text-muted-foreground">Casco inicial: {ship.initial ?? "no registrado"} · Daño causado: {ship.damage}</p>
      </section>)}</div>
      <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Swords className="h-4 w-4" />Decisiones y estado por ronda</h3>
        {!rounds.length && <p className="text-sm text-muted-foreground">No se registraron rondas de combate.</p>}
        <ol className="divide-y divide-border">{rounds.map((round, i) => <li key={`${round.block ?? 1}-${round.round}-${i}`} className="py-4">
          <h4 className="mb-3 text-xs font-semibold text-muted-foreground">Bloque {round.block ?? Math.floor(i / 5) + 1} · Ronda {round.round}</h4>
          <div className="grid gap-4 sm:grid-cols-2">{[
            { name: attackerName, order: round.a_order, hits: round.a_hits, heal: round.a_heal, hull: round.a_hull, initial: report.a_hull0 },
            { name: defenderName, order: round.d_order, hits: round.d_hits, heal: round.d_heal, hull: round.d_hull, initial: report.d_hull0 },
          ].map((side, sideIndex) => <div key={sideIndex} className="min-w-0 space-y-2">
            <p className="break-words text-xs font-semibold">{side.name}</p>
            <p className="flex items-center gap-2 text-sm text-primary"><span aria-hidden="true" title={ORDERS[side.order].label} className="text-xl">{ORDERS[side.order].icon}</span>{ORDERS[side.order].short}</p>
            <p className="text-xs">Causa {side.hits} de daño{(side.heal ?? 0) > 0 ? ` · repara ${side.heal} de casco` : ""}</p>
            <HullBar name={side.name} hull={side.hull} initial={side.initial} />
          </div>)}</div>
        </li>)}</ol>
      </section>
    </DialogContent>
  </Dialog>;
}