import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { db, listQuery } from "@/lib/legions/queries";
import { detachmentById, formationById, units, weaponById } from "@/lib/legions/data";
import { formationLabel, slotSize } from "@/lib/legions/engine";
import { engineProfile, unitForDetachment } from "@/lib/battle";
import { ruleEs } from "@/lib/rules-es";
import { schematicFor, schematicKind, SCHEMATIC_LABEL } from "@/lib/schematics";
import { formationRuleEs } from "@/components/battle/Aids";
import type { Unit } from "@/types/legions";
import type { Saved40kList } from "@/lib/wh40k-queries";
import { Print40k } from "@/components/wh40k/Print40k";
import { PrintPatrol } from "@/components/wh40k/PrintPatrol";

export const Route = createFileRoute("/_authenticated/listas_/$id/imprimir")({
  head: () => ({
    meta: [
      { title: "Fichas para imprimir — Atalaya" },
      { name: "description", content: "Tu lista de ejército lista para imprimir." },
      { property: "og:title", content: "Fichas para imprimir — Atalaya" },
      { property: "og:description", content: "Fichas de unidades para imprimir." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(listQuery(params.id)),
  component: PrintCards,
});

const Box = ({ n, round }: { n: number; round?: boolean }) => (
  <span className="flex flex-wrap gap-1">{Array.from({ length: n }, (_, i) => <span key={i} className={`inline-block h-4 w-4 border-2 border-foreground ${round ? "rounded-full" : ""}`} />)}</span>
);

function PrintCards() {
  const { id } = Route.useParams();
  const { data: list } = useSuspenseQuery(listQuery(id));
  if (!list) return <p className="p-6">Lista no encontrada.</p>;
  const l40 = list as unknown as Saved40kList;
  if (l40.game_system === "40k") return l40.list_format === "patrulla" ? <PrintPatrol list={l40} /> : <Print40k list={l40} />;

  // Unidades únicas con cantidad total de modelos
  const entries = new Map<number, { u: Unit; models: number; dets: string[] }>();
  for (const f of list.formations) for (const g of f.groups) for (const s of g.slots) {
    const d = s.detachment_id !== null ? detachmentById.get(s.detachment_id) : undefined;
    if (!d) continue;
    const u = unitForDetachment(d as { name: string; main_unit?: number[] }, units);
    if (!u) continue;
    const e = entries.get(u.id) ?? { u, models: 0, dets: [] };
    e.models += slotSize(db, s) || d.base_size;
    if (!e.dets.includes(d.name)) e.dets.push(d.name);
    entries.set(u.id, e);
  }
  const cards = [...entries.values()];

  return (
    <div className="light min-h-screen bg-background p-6 text-foreground print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/listas/$id" params={{ id }} className="text-sm underline">&lt; Volver a la lista</Link>
        <button onClick={() => window.print()} className="border-2 border-foreground px-4 py-2 font-bold">Imprimir fichas</button>
      </div>
      <h1 className="mb-1 font-display text-2xl">{list.name}</h1>
      <p className="mb-4 text-xs">{list.points} pts · {cards.length} fichas de unidad</p>

      <section className="mb-6 break-inside-avoid border-2 border-foreground p-3">
        <h2 className="mb-2 font-display text-lg">Reglas de formación</h2>
        {list.formations.map((f) => {
          const fm = f.formation_id !== null ? formationById.get(f.formation_id) : undefined;
          if (!fm) return null;
          return (
            <div key={f.uid} className="mb-2 text-xs">
              <div className="font-bold">{f.nickname || formationLabel(fm)}{f.subfaction ? ` · ${f.subfaction}` : ""}</div>
              <ul className="ml-4 list-disc">{fm.rules.map((r, i) => { const es = formationRuleEs(r); return <li key={i}><b>{es?.name_es || r.name}</b>: {es?.text_es || r.text}</li>; })}</ul>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-2 gap-4 print:gap-3">
        {cards.map(({ u, models, dets }) => {
          const ep = engineProfile(u);
          const big = !!ep;
          return (
            <article key={u.id} className={`break-inside-avoid border-2 border-foreground ${big ? "col-span-2" : ""}`}>
              <header className="flex items-center justify-between border-b-2 border-foreground bg-muted px-3 py-1">
                <div>
                  <div className="font-display text-base font-bold">{u.name}</div>
                  <div className="text-[10px] uppercase tracking-wider">{SCHEMATIC_LABEL[schematicKind(u)]} · {dets.join(" / ")}</div>
                </div>
                <div className="text-xs font-bold">×{models}</div>
              </header>
              <div className={`grid gap-2 p-2 ${big ? "grid-cols-[220px_1fr]" : "grid-cols-[96px_1fr]"}`}>
                <img src={schematicFor(u)} alt={`Esquema de ${u.name}`} className="w-full border border-foreground object-contain [filter:invert(1)_hue-rotate(180deg)]" />
                <div className="space-y-2 text-[11px]">
                  <table className="w-full border border-foreground text-center">
                    <thead className="bg-muted"><tr>{["Mov", "Salv", "CaF", "Moral", "Heridas"].map((h) => <th key={h} className="border border-foreground px-1">{h}</th>)}</tr></thead>
                    <tbody><tr>
                      <td className="border border-foreground">{u.movement}</td><td className="border border-foreground">{u.save}+</td>
                      <td className="border border-foreground">{u.caf >= 0 ? `+${u.caf}` : u.caf}</td><td className="border border-foreground">{u.morale ? `${u.morale}+` : "—"}</td>
                      <td className="border border-foreground">{u.wounds}</td>
                    </tr></tbody>
                  </table>
                  {u.weapons.length > 0 && (
                    <table className="w-full border border-foreground text-left">
                      <thead className="bg-muted"><tr>{["Arma", "Alc", "Dados", "Imp", "FP", "Rasgos"].map((h) => <th key={h} className="border border-foreground px-1">{h}</th>)}</tr></thead>
                      <tbody>{u.weapons.flatMap((wid) => {
                        const w = weaponById.get(wid);
                        if (!w) return [];
                        return w.profiles.map((p, i) => (
                          <tr key={`${wid}-${i}`}>
                            <td className="border border-foreground px-1">{i === 0 ? w.name : ""}</td><td className="border border-foreground px-1">{p.range}</td>
                            <td className="border border-foreground px-1">{p.dice ?? "—"}</td><td className="border border-foreground px-1">{p.to_hit ? `${p.to_hit}+` : "—"}</td>
                            <td className="border border-foreground px-1">{p.ap}</td>
                            <td className="border border-foreground px-1">{p.traits.map((t) => `${ruleEs(t.name)?.name_es ?? t.name}${t.value !== undefined ? ` (${t.value})` : ""}`).join(", ")}</td>
                          </tr>
                        ));
                      })}</tbody>
                    </table>
                  )}
                  {u.special_rules.length > 0 && (
                    <div>
                      <div className="font-bold uppercase">Reglas especiales</div>
                      <ul className="ml-4 list-disc">{u.special_rules.map((r) => {
                        const es = ruleEs(r.name);
                        const desc = es?.description_es || es?.description_en || "";
                        return <li key={r.name}><b>{es?.name_es ?? r.name.replace(/^[:\s]+/, "")}{r.value !== undefined ? ` (${r.value})` : ""}</b>{desc && `: ${desc.length > 260 ? desc.slice(0, 260) + "…" : desc}`}</li>;
                      })}</ul>
                    </div>
                  )}
                  {ep && (
                    <div className="space-y-2 border-t-2 border-foreground pt-2">
                      {Array.from({ length: models }, (_, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-x-6 gap-y-1">
                          <span className="font-bold">{u.name}{models > 1 ? ` #${i + 1}` : ""}</span>
                          {ep.maxShields > 0 && <span className="flex items-center gap-2">Escudos de vacío <Box n={ep.maxShields} round /></span>}
                          {ep.ion && <span>Escudo iónico {ep.ion}</span>}
                          <span className="flex items-center gap-2">Heridas <Box n={ep.maxWounds} /></span>
                        </div>
                      ))}
                      <p className="text-[9px]">Marca una casilla cada vez que pierda un escudo o una herida; borra los escudos al regenerarlos.</p>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!cards.length && <p className="text-sm">Esta lista no tiene destacamentos con ficha de unidad vinculada.</p>}
    </div>
  );
}
