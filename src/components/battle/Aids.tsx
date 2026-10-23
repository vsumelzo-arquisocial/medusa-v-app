import { useMemo, useState } from "react";
import { expectedHits, modifiedSave, rollD6 } from "@/lib/battle";
import rulesEs from "@/data/legions/rules_es.json";
import formationRulesEs from "@/data/legions/formation_rules_es.json";

const inp = "w-full border border-border bg-background px-2 py-1 text-sm";

export function HitAssistant() {
  const [dice, setDice] = useState(4), [toHit, setToHit] = useState(4), [mod, setMod] = useState(0);
  const [save, setSave] = useState<number | null>(4), [ap, setAp] = useState(0);
  const [roll, setRoll] = useState<{ hits: number[]; saves: number[] } | null>(null);
  const exp = expectedHits(dice, toHit, mod, save, ap);
  const need = Math.max(2, Math.min(7, toHit - mod));
  const saveNeed = save === null ? null : modifiedSave(save, ap);
  function doRoll() {
    const hits = rollD6(dice);
    const n = hits.filter((d) => d >= need).length;
    setRoll({ hits, saves: saveNeed === null ? [] : rollD6(n) });
  }
  const hitCount = roll?.hits.filter((d) => d >= need).length ?? 0;
  const failed = roll ? (saveNeed === null ? hitCount : roll.saves.filter((d) => d < saveNeed).length) : 0;
  const Die = ({ v, ok }: { v: number; ok: boolean }) => <span className={`inline-flex h-6 w-6 items-center justify-center border text-xs ${ok ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{v}</span>;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label>Dados<input type="number" min={1} className={inp} value={dice} onChange={(e) => setDice(+e.target.value)} /></label>
        <label>Impacta (x+)<input type="number" min={2} max={6} className={inp} value={toHit} onChange={(e) => setToHit(+e.target.value)} /></label>
        <label>Modif. impacto<input type="number" className={inp} value={mod} onChange={(e) => setMod(+e.target.value)} /></label>
        <label>Salvación (x+)<select className={inp} value={save ?? ""} onChange={(e) => setSave(e.target.value ? +e.target.value : null)}>
          <option value="">Ninguna</option>{[2, 3, 4, 5, 6].map((s) => <option key={s} value={s}>{s}+</option>)}</select></label>
        <label>FP (AP)<input type="number" max={0} className={inp} value={ap} onChange={(e) => setAp(+e.target.value)} /></label>
      </div>
      <p className="text-xs text-muted-foreground">
        Impacta con {need > 6 ? "imposible" : `${need}+`} · salvación del objetivo {saveNeed === null ? "ninguna" : saveNeed > 6 ? "sin salvación" : `${saveNeed}+`}.
        Media: <span className="text-primary">{exp.hits.toFixed(2)}</span> impactos, <span className="text-primary">{exp.unsaved.toFixed(2)}</span> sin salvar.
      </p>
      <button onClick={doRoll} className="border border-primary px-3 py-1 text-primary hover:bg-accent">Tirar dados</button>
      {roll && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">Impacto: {roll.hits.map((d, i) => <Die key={i} v={d} ok={d >= need} />)}</div>
          {saveNeed !== null && <div className="flex flex-wrap gap-1">Salvación: {roll.saves.map((d, i) => <Die key={i} v={d} ok={d >= saveNeed} />)}</div>}
          <div className="text-primary glow">{hitCount} impactos → {failed} sin salvar</div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Escudos de vacío / iónicos y rasgos de arma (Rending, Ignore Cover…) se aplican aparte: consulta las reglas.</p>
    </div>
  );
}

type Rule = { kind: string; name_en: string; name_es: string; description_en: string; description_es: string };
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function RulesReference() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "special_rule" | "weapon_trait">("all");
  const all = useMemo(() => (rulesEs as Rule[]).slice().sort((a, b) => a.name_es.localeCompare(b.name_es)), []);
  const nq = norm(q);
  const shown = all.filter((r) => (kind === "all" || r.kind === kind) && (!nq || norm(r.name_es + " " + r.name_en).includes(nq)));
  return (
    <div>
      <input placeholder="Buscar regla (español o inglés)…" value={q} onChange={(e) => setQ(e.target.value)} className={`${inp} mb-2`} />
      <div className="mb-2 flex gap-1 text-[11px]">
        {([["all", "Todas"], ["special_rule", "Reglas especiales"], ["weapon_trait", "Rasgos de arma"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`border px-2 py-1 ${kind === k ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      <ul className="max-h-[520px] space-y-1 overflow-y-auto text-xs">
        {shown.map((r) => (
          <li key={r.kind + r.name_en}><details><summary className="cursor-pointer"><span className="text-primary">{r.name_es}</span> <span className="text-muted-foreground">· {r.name_en} · {r.kind === "weapon_trait" ? "Rasgo de arma" : "Regla especial"}</span></summary>
            <p className="mt-1 whitespace-pre-line border-l border-border pl-2">{r.description_es || r.description_en}</p></details></li>
        ))}
        {!shown.length && <li className="text-muted-foreground">&gt; Sin resultados.</li>}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">{all.length} reglas y rasgos sacados del reglamento y traducidos.</p>
    </div>
  );
}

export const formationRuleEs = (r: { name?: string; text: string }) => (formationRulesEs as Record<string, { name_es: string; text_es: string }>)[`${r.name ?? ""}||${r.text}`];

const GUIDE: [string, string[]][] = [
  ["1. Fase de iniciativa", ["Ambos jugadores tiran por la iniciativa; quien gana decide quién empieza a activar.", "Se asignan las órdenes (boca abajo) a cada destacamento."]],
  ["2. Fase de movimiento", ["Se alternan activaciones de destacamentos según su orden: Avanzar, Cargar, Marchar, Primer fuego…", "Comprueba coherencia y terreno."]],
  ["3. Fase de combate", ["Disparo: elige objetivo, tira impactos, el rival tira salvaciones y escudos.", "Combate cuerpo a cuerpo: resuelve los enfrentamientos trabados con CaF."]],
  ["4. Fase final", ["Retira las órdenes, regenera escudos de vacío (registra aquí los recuperados).", "Comprueba formaciones que han alcanzado su punto de ruptura: chequeo de moral.", "Puntúa objetivos y anota los puntos de victoria de la ronda."]],
];

export function GameGuide() {
  return (
    <div className="space-y-3 text-sm">
      {GUIDE.map(([t, xs]) => (
        <div key={t}><div className="text-primary">{t}</div><ul className="ml-4 list-disc text-xs">{xs.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
      <p className="text-[10px] text-muted-foreground">Resumen orientativo de la secuencia de turno. Para el detalle exacto consulta el reglamento.</p>
    </div>
  );
}
