import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { pointsQuery, type Saved40kList } from "@/lib/wh40k-queries";
import { battleSize, findDetachment, priceRoster } from "@/lib/wh40k-lists";
import { get40kFaction } from "@/lib/warhammer40k-factions";

export function Print40k({ list }: { list: Saved40kList }) {
  const { data } = useQuery(pointsQuery(list.army_faction ?? ""));
  if (!data) return <p className="p-6">Cargando…</p>;
  const roster = list.roster ?? { detachments: [], units: [] };
  const priced = priceRoster(roster, data);
  const total = priced.reduce((a, p) => a + p.total, 0);
  return (
    <div className="light min-h-screen bg-background p-6 text-foreground print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/listas/$id" params={{ id: list.id }} className="text-sm underline">&lt; Volver a la lista</Link>
        <button onClick={() => window.print()} className="border-2 border-foreground px-4 py-2 font-bold">Imprimir</button>
      </div>
      <h1 className="font-display text-2xl">{list.name}</h1>
      <p className="mb-1 text-sm">{get40kFaction(list.army_faction ?? "")?.name} · {battleSize(list.points).label} · {total}/{list.points} pts</p>
      <p className="mb-4 text-xs">{list.mode === "coleccion" ? "Lista de reclutamiento" : "Simulación (no válida para batallas de campaña)"}</p>
      <section className="mb-4 border-2 border-foreground p-3 text-sm">
        <h2 className="font-display">Destacamentos</h2>
        {roster.detachments.map((n) => { const d = findDetachment(data, n); return <p key={n}>{n} · {d?.dp} DP · {d?.dispositions.join(", ")}</p>; })}
      </section>
      <table className="w-full border-2 border-foreground text-sm">
        <thead><tr className="border-b-2 border-foreground text-left"><th className="p-1">Unidad</th><th>Miniaturas</th><th>Notas</th><th className="text-right p-1">Pts</th></tr></thead>
        <tbody>
          {priced.map((p) => (
            <tr key={p.unit.id} className="border-b border-foreground/40">
              <td className="p-1">{p.unit.name}</td><td>{p.unit.models}</td>
              <td className="text-xs">{[p.unit.warlord && "Señor de la guerra", p.unit.enhancement, ...Object.entries(p.unit.wargear ?? {}).filter(([, c]) => c).map(([w, c]) => `${c}× ${w.replace(/^per /, "")}`)].filter(Boolean).join(" · ")}</td>
              <td className="p-1 text-right">{p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
