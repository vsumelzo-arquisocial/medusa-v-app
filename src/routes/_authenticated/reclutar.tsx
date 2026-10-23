import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { profileQuery } from "@/lib/profile";
import { listsQuery } from "@/lib/legions/queries";
import { pointsQuery, recruitsQuery, type Saved40kList } from "@/lib/wh40k-queries";
import { findUnit, pendingRecruits, requirements, sizesOf, type Roster } from "@/lib/wh40k-lists";
import { get40kFaction } from "@/lib/warhammer40k-factions";
import { shipQuery } from '@/lib/ship-queries';
import { Button } from '@/components/ui/button';
import { recruitmentSeconds } from '@/lib/ship-identity';
import { RecruitQueue } from '@/components/wh40k/RecruitQueue';
import { squadsQuery } from '@/lib/wh40k-units';

const ocQuery = (faction: string) => ({queryKey:['unit-oc',faction],queryFn:async()=>{const {data,error}=await supabase.from('wh40k_unit_prices').select('unit_name,models,oc_per_model').eq('faction',faction);if(error)throw error;return data??[];}});

export const Route = createFileRoute("/_authenticated/reclutar")({
  head: () => ({ meta: [
    { title: "Reclutamiento — Atalaya" },
    { name: "description", content: "Recluta unidades de tu facción de Warhammer 40.000, revisa tu stock y completa lo que piden tus listas." },
    { property: "og:title", content: "Reclutamiento — Atalaya" },
    { property: "og:description", content: "Recluta unidades, revisa tu stock y completa tus listas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: async ({ context }) => {
    const p = await context.queryClient.ensureQueryData(profileQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(recruitsQuery),
      context.queryClient.ensureQueryData(listsQuery),
      context.queryClient.ensureQueryData(pointsQuery(p.profile?.army_faction ?? "")),
      context.queryClient.ensureQueryData(shipQuery),
      context.queryClient.ensureQueryData(ocQuery(p.profile?.army_faction ?? '')),
      context.queryClient.ensureQueryData(squadsQuery),
    ]);
  },
  component: Recruit,
});

const ERR: [string, string][] = [["cargo full", "Bodega llena: amplía su capacidad OC en Nave"], ["OC unavailable", "Faltan datos OC verificables para esta unidad o tu bodega"], ["no ship", "Crea tu nave antes de reclutar"], ["credits", "No tienes créditos suficientes"], ["epic hero", "Los héroes de renombre solo se pueden reclutar una vez"], ["bad unit", "Esa unidad no se puede reclutar con ese tamaño"]];

function Recruit() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const faction = prof.profile?.army_faction ?? "";
  const { data } = useSuspenseQuery(pointsQuery(faction));
  const { data: recruits } = useSuspenseQuery(recruitsQuery);
  const { data: lists } = useSuspenseQuery(listsQuery);
  const { data: ship } = useSuspenseQuery(shipQuery);
  const { data: oc } = useSuspenseQuery(ocQuery(faction));
  const { data: squads } = useSuspenseQuery(squadsQuery);
  const ocOf = (name: string, models: number) => {const p=oc.find(x=>x.unit_name.toUpperCase()===name.toUpperCase()&&x.models===models);return p?.oc_per_model==null?null:p.oc_per_model*models;};
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = recruits.filter((r) => r.faction === faction);
  const myLists = (lists as unknown as Saved40kList[]).filter((l) => l.game_system === "40k" && l.army_faction === faction);
  const listRequirements = myLists.map((l) => requirements((l.roster ?? { units: [] }) as Roster, mine));
  const pending = pendingRecruits(listRequirements, squads.filter((s) => s.faction === faction));
  const awaitingTraining = pendingRecruits(listRequirements).length > 0 && !pending.length;
  const stockOf = (name: string) => mine.filter((r) => r.unit_name.toLowerCase() === name.toLowerCase()).reduce((a, r) => a + r.quantity, 0);
  const priceOf = (name: string, models: number) => { const u = findUnit(data, name); return u?.tiers[0]?.options.find((o) => o.models === models)?.pts ?? null; };

  async function act(fn: "recruit_40k" | "dismiss_40k", unit: string, models: number, qty = 1, bulk = false) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc(fn, { _unit: unit, _models: models, _qty: qty });
      if (error) { toast.error(ERR.find(([k]) => error.message.includes(k))?.[1] ?? "No se pudo completar"); return false; }
      toast.success(fn === "recruit_40k" ? `${unit} en reclutamiento` : `${unit} licenciada`);
      await qc.invalidateQueries({ queryKey: ['wh40k-squads'] });
      await Promise.all(['wh40k-recruits', 'profile', 'ship'].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      return true;
    } finally { if (!bulk) setBusy(false); }
  }
  async function recruitAll() {
    setBusy(true);
    try {
    for (const r of pending) {
      const u = findUnit(data, r.name);
      if (!u) continue;
      if (!(await act("recruit_40k", u.name, r.models, Math.min(10, r.need - r.have), true))) break;
    }
    } finally { setBusy(false); }
  }
  const pendingCost = pending.reduce((a, r) => a + (priceOf(r.name, r.models) ?? 0) * (r.need - r.have), 0);

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{get40kFaction(faction)?.name}</p>
          <h1 className="text-2xl text-primary glow">Reclutamiento</h1>
        </div>
        <p className="text-sm">Créditos: <span className="text-primary">{prof.profile?.imperial_credits}</span></p>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Cada unidad cuesta en créditos sus puntos oficiales actuales; lo ya reclutado no cambia aunque cambien los puntos. Los héroes de renombre (★) solo se reclutan una vez. <Link to="/listas" className="text-primary">Ir a listas →</Link></p>
      <div className="mb-5 flex flex-wrap justify-between gap-3 border-y border-border py-3 text-sm"><span>Bodega: {ship.status.used_oc}/{ship.status.capacity} OC · libres {Math.max(0,ship.status.capacity-ship.status.used_oc)}</span><span>Comunicaciones: tiempo −{ship.status.recruitment_reduction}%</span><Link to="/nave" className="text-primary">Ampliar nave →</Link></div>

      <div className="mb-4"><RecruitQueue /></div>
      <Panel title="Lo que piden tus listas">
        {!myLists.length && <p className="text-xs text-muted-foreground">&gt; Importa una lista para ver aquí lo que necesitas.</p>}
        {!!myLists.length && !pending.length && <p className="text-xs text-primary">{awaitingTraining ? 'Todas las unidades que faltaban están en preparación.' : '✔ Todas tus listas son jugables.'}</p>}
        {!!pending.length && (<>
          <ul className="mb-3 grid gap-1 sm:grid-cols-2">
            {pending.map((r) => {
              const u = findUnit(data, r.name); const pts = priceOf(r.name, r.models); const n = r.need - r.have;
              return (
                <li key={r.name + r.models} className="flex items-center gap-2 border border-destructive/60 p-2 text-xs">
                  <span className="flex-1"><span className="text-primary">{u?.epicHero ? "★ " : ""}{r.name}</span> ({r.models}) · {n === 1 ? 'falta' : 'faltan'} <span className="text-destructive">{n}</span></span>
                  {u && pts !== null
                    ? <Button variant="outline" size="sm" disabled={busy} onClick={() => act("recruit_40k", u.name, r.models)}>Reclutar · {pts} cr</Button>
                    : <span className="text-muted-foreground">No reclutable</span>}
                </li>
              );
            })}
          </ul>
          <button disabled={busy} onClick={recruitAll} className="border border-primary px-3 py-2 text-xs uppercase text-primary hover:bg-accent disabled:opacity-40">Reclutar todo lo que falta · {pendingCost} cr</button>
        </>)}
      </Panel>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_320px]">
        <Panel title="Unidades disponibles">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar unidad" className="mb-2 w-full border border-border bg-background px-2 py-1 text-xs" />
          <ul className="grid gap-1 sm:grid-cols-2">
            {data.units.filter((u) => u.name.toLowerCase().includes(filter.toLowerCase())).map((u) => {
              const stock = stockOf(u.name); const locked = !!u.epicHero && stock > 0;
              return (
                <li key={u.name} className="border border-border p-2 text-xs">
                  <div className="flex justify-between gap-2"><span className="text-primary">{u.epicHero ? "★ " : ""}{u.name}</span>{stock > 0 && <span className="text-muted-foreground">En stock: {stock}</span>}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {locked ? <span className="text-muted-foreground">Héroe único ya reclutado</span> : sizesOf(u).map((s) => (
                      <Button variant="outline" size="sm" key={s} disabled={busy||ocOf(u.name,s)===null} onClick={() => act("recruit_40k", u.name, s)} className="h-auto flex-col items-start whitespace-normal px-2 py-1 text-left text-xs">
                        <span>{s} mod. · {u.tiers[0]?.options.find((o) => o.models === s)?.pts} cr</span>
                        <span className="text-muted-foreground">{ocOf(u.name,s)??'Sin datos'} OC · {Math.ceil(recruitmentSeconds(priceOf(u.name,s)??0,ship.status.recruitment_reduction/10)/60)} min</span>
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Tu stock">
          {!mine.length && <p className="text-xs text-muted-foreground">&gt; Aún no has reclutado nada.</p>}
          <ul className="space-y-1 text-xs">
            {mine.map((r) => (
              <li key={r.unit_name + r.models} className="flex items-center gap-2 border border-border p-1.5">
                <span className="flex-1">{r.quantity}× {r.unit_name} ({r.models})</span>
                <button disabled={busy} onClick={() => confirm(`¿Licenciar una unidad de ${r.unit_name}? No se devuelven créditos.`) && act("dismiss_40k", r.unit_name, r.models)} className="text-muted-foreground hover:text-destructive">Licenciar</button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </CommandShell>
  );
}
