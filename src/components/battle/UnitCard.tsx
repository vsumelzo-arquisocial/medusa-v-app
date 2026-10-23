import { weaponById } from "@/lib/legions/data";
import { ruleEs } from "@/lib/rules-es";
import { schematicFor, schematicKind, SCHEMATIC_LABEL } from "@/lib/schematics";
import type { Unit } from "@/types/legions";

export function UnitCard({ u }: { u: Unit }) {
  const stats: [string, string | number][] = [
    ["Tipo", SCHEMATIC_LABEL[schematicKind(u)]], ["Mov", u.movement], ["Salv", `${u.save}+`],
    ["CaF", u.caf >= 0 ? `+${u.caf}` : u.caf], ["Moral", u.morale ? `${u.morale}+` : "—"], ["Heridas", u.wounds],
  ];
  return (
    <details className="flex-1">
      <summary className="cursor-pointer">
        {u.name}<span className="ml-2 text-[10px] text-muted-foreground">{SCHEMATIC_LABEL[schematicKind(u)]} · ver ficha</span>
      </summary>
      <div className="mt-2 space-y-2 text-xs">
        <img src={schematicFor(u)} alt={`Esquema de ${u.name}`} loading="lazy" className="h-40 w-full border border-border object-contain bg-background mix-blend-screen" />
        <div className="flex flex-wrap gap-2">
          {stats.map(([k, v]) => <span key={k} className="border border-border px-2 py-1"><span className="text-muted-foreground">{k} </span><span className="text-primary">{v}</span></span>)}
        </div>
        {u.special_rules.length > 0 && (
          <div>
            <div className="uppercase text-muted-foreground">Habilidades</div>
            <ul className="ml-4 list-disc">
              {u.special_rules.map((r) => {
                const info = ruleEs(r.name);
                const nm = r.name.replace(/^[:\s]+/, "");
                return <li key={r.name}><span className="text-primary">{info?.name_es ?? nm}{r.value !== undefined ? ` (${r.value})` : ""}</span>{info && <span className="text-muted-foreground"> ({info.name_en}) — {info.description_es || info.description_en}</span>}</li>;
              })}
            </ul>
          </div>
        )}
        {u.weapons.length > 0 && (
          <div>
            <div className="uppercase text-muted-foreground">Armas</div>
            <table className="w-full text-left">
              <thead className="text-muted-foreground"><tr><th>Arma</th><th>Alc</th><th>Dados</th><th>Imp</th><th>FP</th><th>Rasgos</th></tr></thead>
              <tbody>
                {u.weapons.flatMap((id) => {
                  const w = weaponById.get(id);
                  if (!w) return [];
                  return w.profiles.map((p, i) => (
                    <tr key={`${id}-${i}`} className="border-t border-border">
                      <td>{i === 0 ? w.name : ""}</td><td>{p.range}</td><td>{p.dice ?? "—"}</td><td>{p.to_hit ? `${p.to_hit}+` : "—"}</td><td>{p.ap}</td>
                      <td>{p.traits.map((t) => t.value !== undefined ? `${t.name} (${t.value})` : t.name).join(", ")}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
