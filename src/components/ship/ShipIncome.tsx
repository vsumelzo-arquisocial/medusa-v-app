import { useQuery } from "@tanstack/react-query";
import { Coins, Radio } from "lucide-react";
import { byBody, incomeBreakdownQuery, LOSS_PER_ORBIT, MAX_LOSS } from "@/lib/income";
import { REGION_TYPES } from "@/lib/planet";
import { bodyName } from "@/lib/system";

/** Ingresos de todos los planetas conquistados, con la pérdida por distancia a la nave. */
export function ShipIncome({ onAntenna }: { onAntenna?: () => void }) {
  const { data } = useQuery(incomeBreakdownQuery);
  if (!data) return null;
  const groups = byBody(data);
  const mines = Math.floor(groups.reduce((a, g) => a + g.credits, 0));
  const reduction = Math.round((data.antenna / 3) * 100);
  return (
    <section className="mb-6" aria-labelledby="ship-income">
      <h2 id="ship-income" className="mb-3 flex items-center gap-2 text-xl text-primary">
        <Coins size={18} /> Ingresos del dominio
      </h2>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-1 border-l-2 border-primary pl-3 text-sm">
          <p className="flex justify-between">
            <span className="text-muted-foreground">Base</span>
            <span>+{data.base}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">Puente de mando</span>
            <span>+{data.bridge}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">
              Minas ({data.regions.filter((r) => r.type === "mina").length})
            </span>
            <span>+{mines}</span>
          </p>
          <p className="flex justify-between border-t border-border pt-1 text-primary">
            <span>Cada 24 h</span>
            <span>+{data.total} cr</span>
          </p>
          <p className="pt-2 text-xs text-muted-foreground">
            Cada mina da +{data.mine_credits} cr. Las regiones lejanas pierden un{" "}
            {Math.round(LOSS_PER_ORBIT * 100)} % por órbita de distancia (máx.{" "}
            {Math.round(MAX_LOSS * 100)} %).
          </p>
          <button
            type="button"
            onClick={onAntenna}
            className="mt-1 flex items-center gap-1.5 text-left text-xs text-primary underline-offset-2 hover:underline"
          >
            <Radio size={13} /> Antena N{data.antenna}: pérdida −{reduction} %
            {data.antenna < 3 ? " · mejorar" : ""}
          </button>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no tienes regiones con bonificación. Conquista minas, forjas, diques… en cualquier
            planeta.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => {
              const pct = Math.round(g.factor * 100);
              const here = g.body === data.ship_body;
              return (
                <li key={g.body} className="border border-border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-primary">{bodyName(g.body)}</span>
                    <span
                      className={
                        pct >= 85
                          ? "text-emerald-400"
                          : pct >= 50
                            ? "text-amber-300"
                            : "text-red-400"
                      }
                    >
                      {here ? "Nave aquí · " : ""}
                      {pct} %
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-muted-foreground">
                    {g.regions.map((r) => (
                      <span
                        key={r.id}
                        className="mr-2 inline-block"
                        title={`${r.name} · ${REGION_TYPES[r.type]?.name ?? r.type}`}
                      >
                        {REGION_TYPES[r.type]?.glyph ?? "·"} {REGION_TYPES[r.type]?.name ?? r.type}
                      </span>
                    ))}
                  </p>
                  {g.credits > 0 && (
                    <p className="mt-1 text-primary">+{Math.floor(g.credits)} cr/día</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
