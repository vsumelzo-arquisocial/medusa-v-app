import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { patrolSelection, type PatrolChoice } from "@/lib/wh40k-patrols";
import { get40kFaction } from "@/lib/warhammer40k-factions";
import type { Saved40kList } from "@/lib/wh40k-queries";
import { patrolsQuery } from "@/lib/wh40k-queries";

export function PrintPatrol({ list }: { list: Saved40kList }) {
  const { data: all } = useQuery(patrolsQuery);
  if (!all) return <p className="p-6">Cargando…</p>;
  const c = list.roster as unknown as PatrolChoice;
  const p = all.find((x) => x.id === c.patrolId);
  if (!p) return <p className="p-6">Patrulla no encontrada.</p>;
  const { enhancement, objective } = patrolSelection(p, c);
  const Block = ({ t, children }: { t: string; children: React.ReactNode }) => <section className="mb-3 break-inside-avoid border-2 border-foreground p-3 text-sm"><h2 className="mb-1 font-display">{t}</h2>{children}</section>;
  return (
    <div className="light min-h-screen bg-background p-6 text-foreground print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/listas/$id" params={{ id: list.id }} className="text-sm underline">&lt; Volver a la patrulla</Link>
        <button onClick={() => window.print()} className="border-2 border-foreground px-4 py-2 font-bold">Imprimir</button>
      </div>
      <h1 className="font-display text-2xl">{list.name}</h1>
      <p className="mb-4 text-sm">{get40kFaction(list.army_faction ?? "")?.name} · Patrulla de combate: {p.name} · documento oficial de 10.ª edición</p>
      <Block t="Unidades">
        {p.units.map((u, i) => <div key={i} className="mb-1"><b>{u.name}</b> ({u.models})<ul className="ml-4 list-disc text-xs">{u.equipment.map((e) => <li key={e}>{e}</li>)}</ul></div>)}
      </Block>
      {p.warlord && <Block t="Señor de la guerra"><p className="text-xs">{p.warlord}</p></Block>}
      {enhancement && <Block t={`Mejora: ${enhancement.name}`}><p className="text-xs">{enhancement.text}</p></Block>}
      {objective && <Block t={`Objetivo secundario: ${objective.name}`}><p className="text-xs">{objective.text}</p></Block>}
      {p.abilities && <Block t="Habilidades"><p className="whitespace-pre-line text-xs">{p.abilities}</p></Block>}
      {p.stratagems && <Block t="Estratagemas"><p className="whitespace-pre-line text-xs">{p.stratagems}</p></Block>}
    </div>
  );
}
