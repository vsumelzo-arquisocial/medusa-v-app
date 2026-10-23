import { recruitBonus } from "@/lib/planet";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { profileQuery } from "@/lib/profile";
import { FACTION_ORDER, factionLabel, unitById } from "@/lib/legions/data";
import { UnitCard } from "@/components/battle/UnitCard";

type Cat = "infanteria" | "blindado" | "caballero" | "titan";
const CATS: { id: Cat; label: string; origin: string; mod: string; cap: (l: (m: string) => number) => number }[] = [
  { id: "infanteria", label: "Infantería", origin: "Llega desde otros sistemas en lanzaderas", mod: "barracones", cap: (l) => 100 + 30 * l("bodegas") },
  { id: "blindado", label: "Blindados", origin: "Refuerzos de los mundos forja", mod: "astropatico", cap: (l) => 100 + 30 * l("bodegas") },
  { id: "caballero", label: "Caballeros", origin: "Juramentos de las Casas nobles", mod: "forja", cap: (l) => 6 + 3 * l("establos") },
];

const reservesQuery = queryOptions({
  queryKey: ["reserves"],
  queryFn: async () => {
    await supabase.rpc("ship_tick");
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? "";
    const [cat, coll, orders, mods, ship, regs] = await Promise.all([
      supabase.from("unit_catalog").select("*").order("cost"),
      supabase.from("collection_items").select("unit_id, quantity").eq("user_id", uid),
      supabase.from("recruit_orders").select("*").eq("user_id", uid).order("ready_at"),
      supabase.from("ship_modules").select("module, level").eq("user_id", uid),
      supabase.from("ships").select("name").eq("user_id", uid).maybeSingle(),
      supabase.from("regions").select("type").eq("owner_id", uid),
    ]);
    return { catalog: cat.data ?? [], coll: coll.data ?? [], orders: orders.data ?? [], mods: mods.data ?? [], ship: ship.data, regionTypes: (regs.data ?? []).map((r) => r.type) };
  },
  refetchInterval: 30000,
});

export const Route = createFileRoute("/_authenticated/coleccion")({
  head: () => ({
    meta: [
      { title: "Mis reservas y reclutamiento — Atalaya" },
      { name: "description", content: "Recluta infantería, blindados, Caballeros y Titanes para tus reservas a bordo de la nave." },
      { property: "og:title", content: "Mis reservas — Atalaya" },
      { property: "og:description", content: "Recluta y gestiona las fuerzas de tu nave fortaleza." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(reservesQuery)]),
  component: Reservas,
});

const ERR: Record<string, string> = {
  credits: "No tienes Créditos Imperiales suficientes",
  "no capacity": "No hay espacio a bordo: amplía Bodegas, Hangar o Establos",
  "no ship": "Primero bautiza tu nave",
};

function left(until: string, now: number) {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "llegando…";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} min`;
}

function Reservas() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data } = useSuspenseQuery(reservesQuery);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Cat>("infanteria");
  const [filter, setFilter] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["reserves"] }); qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["collection"] }); qc.invalidateQueries({ queryKey: ["ship"] }); qc.invalidateQueries({ queryKey: ["veterans"] }); };

  const lvl = (m: string) => data.mods.find((x) => x.module === m)?.level ?? 0;
  const catOf = (id: number) => data.catalog.find((c) => c.unit_id === id)?.category as Cat | undefined;
  const sum = (rows: { unit_id: number; quantity: number }[], cats: Cat[]) => rows.filter((r) => cats.includes(catOf(r.unit_id)!)).reduce((a, r) => a + r.quantity, 0);
  const pool = (c: Cat): Cat[] => (c === "infanteria" || c === "blindado" ? ["infanteria", "blindado"] : [c]);

  if (!data.ship) {
    return (
      <CommandShell isAdmin={prof.isAdmin}>
        <Panel title="Sin nave">
          <p className="text-sm">&gt; Necesitas una nave fortaleza para alojar tus reservas. <Link to="/nave" className="text-primary underline">Bautízala aquí</Link>.</p>
        </Panel>
      </CommandShell>
    );
  }

  async function dismiss(unit: number, name: string, owned: number) {
    const raw = prompt(`ACCIÓN IRREVERSIBLE: las unidades destruidas se pierden para siempre y no se devuelven créditos.\n\n¿Cuántas ${name} quieres destruir? (tienes ${owned})`, "1");
    if (!raw) return;
    const n = Math.floor(Number(raw));
    if (!(n >= 1 && n <= owned)) { toast.error("Cantidad no válida"); return; }
    if (!confirm(`¿Seguro? Se destruirán ${n} × ${name}. No se puede deshacer.`)) return;
    const { error } = await supabase.rpc("dismiss_unit_and_veterans", { _unit: unit, _qty: n });
    if (error) toast.error("No se pudo destruir"); else { toast.success(`${n} × ${name} destruidas · espacio liberado`); refresh(); }
  }
  async function recruit(unit: number, n: number) {
    const { error } = await supabase.rpc("recruit_unit", { _unit: unit, _qty: n });
    if (error) { toast.error(ERR[Object.keys(ERR).find((k) => error.message.includes(k)) ?? ""] ?? "No se pudo reclutar"); return; }
    toast.success("Orden de reclutamiento enviada");
    refresh();
  }
  async function cancel(id: string) {
    const { error } = await supabase.rpc("cancel_recruit", { _id: id });
    if (error) toast.error("No se pudo cancelar"); else { toast.success("Orden cancelada, créditos devueltos"); refresh(); }
  }

  const cat = CATS.find((c) => c.id === tab)!;
  const rb = recruitBonus(data.regionTypes, tab);
  const extra = (id: string) => (id === "infanteria" || id === "blindado" ? recruitBonus(data.regionTypes, id).extraTroops : 0);
  const cap = cat.cap(lvl) + extra(tab);
  const used = sum(data.coll, pool(tab)) + sum(data.orders, pool(tab));
  const speed = Math.round(20 * lvl(cat.mod));
  const totalModels = data.coll.reduce((a, r) => a + r.quantity, 0);

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {CATS.map((c) => {
          const cp = c.cap(lvl) + extra(c.id); const u = sum(data.coll, pool(c.id)) + sum(data.orders, pool(c.id));
          return (
            <button key={c.id} onClick={() => setTab(c.id)} className={`border p-3 text-left ${tab === c.id ? "border-primary glow-box" : "border-border"}`}>
              <div className="font-display text-primary">{c.label}</div>
              <div className="text-xs text-muted-foreground">En reserva: {sum(data.coll, [c.id])} · en camino: {sum(data.orders, [c.id])}</div>
              <div className="mt-2 h-1.5 w-full bg-muted"><div className={`h-full ${u > cp ? "bg-destructive" : "bg-primary"}`} style={{ width: `${cp ? Math.min(100, (u / cp) * 100) : 0}%` }} /></div>
              <div className="mt-1 text-[10px] uppercase text-muted-foreground">{c.id === "infanteria" || c.id === "blindado" ? "Bodegas" : "Plazas"} {u}/{cp}</div>
            </button>
          );
        })}
      </div>

      {data.orders.length > 0 && (
        <div className="mb-6">
          <Panel title={`En camino · ${data.orders.length} órdenes`}>
            <ul className="space-y-2 text-sm">
              {data.orders.map((o) => {
                const total = new Date(o.ready_at).getTime() - new Date(o.created_at).getTime();
                const pct = Math.max(0, Math.min(100, 100 - ((new Date(o.ready_at).getTime() - now) / total) * 100));
                return (
                  <li key={o.id} className="border border-border p-2">
                    <div className="flex justify-between gap-2"><span className="text-primary">{o.quantity} × {unitById.get(o.unit_id)?.name ?? o.unit_id}</span><span className="text-xs">{left(o.ready_at, now)} <button onClick={() => cancel(o.id)} className="ml-2 text-destructive hover:underline">cancelar</button></span></div>
                    <div className="mt-1 h-1 w-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      )}

      <Panel title={`Reclutar ${cat.label.toLowerCase()}`}>
        <p className="mb-1 text-sm">&gt; {cat.origin}.</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Espacio usado {used}/{cap}{cap === 0 ? " — construye el módulo correspondiente en la Nave" : ""} · {lvl(cat.mod) ? `módulo de apoyo −${speed} % de tiempo` : "sin módulo de apoyo"}{rb.time < 1 ? ` · regiones −${Math.round((1 - rb.time) * 100)} % de tiempo` : ""}{rb.cost < 1 ? " · Arsenal −10 % de coste" : ""} · Créditos: <span className="text-primary">{prof.profile?.imperial_credits ?? 0}</span>
        </p>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar unidad..." className="mb-4 w-full border border-border bg-background px-3 py-2 text-sm" />
        {FACTION_ORDER.map((f) => {
          const rows = data.catalog.filter((c) => c.category === tab && unitById.get(c.unit_id)?.faction === f && c.name.toLowerCase().includes(filter.toLowerCase()));
          if (!rows.length) return null;
          return (
            <div key={f} className="mb-6">
              <h3 className="mb-2 text-xs uppercase text-primary">{factionLabel(f)}</h3>
              <ul className="grid gap-2">
                {rows.map((c) => {
                  const u = unitById.get(c.unit_id)!;
                  const owned = data.coll.find((r) => r.unit_id === c.unit_id)?.quantity ?? 0;
                  const hrs = Math.max(0.5, c.hours * (1 - 0.2 * lvl(cat.mod)) * rb.time);
                  const cost = rb.cost < 1 ? Math.round(c.cost * rb.cost * 10) / 10 : c.cost;
                  return (
                    <li key={c.unit_id} className="flex flex-wrap items-start justify-between gap-2 border border-border px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <UnitCard u={u} />
                        <div className="mt-1 text-xs text-muted-foreground">En reserva: <span className="text-primary">{owned}</span> · {cost} cr/u · {hrs >= 24 ? `${Math.round(hrs / 24 * 10) / 10} d` : `${Math.round(hrs)} h`}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(tab === "infanteria" || tab === "blindado" ? [1, 5] : [1]).map((k) => (
                          <button key={k} onClick={() => recruit(c.unit_id, k)} className="border border-primary px-3 py-1 text-xs text-primary hover:bg-accent">Reclutar ×{k} · {Math.round(c.cost * k * rb.cost)} cr</button>
                        ))}
                        {owned > 0 && <button onClick={() => dismiss(c.unit_id, u.name, owned)} className="border border-destructive/50 px-3 py-1 text-xs text-destructive hover:border-destructive">Destruir</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <p className="mt-2 text-[10px] text-muted-foreground">Total en reservas: {totalModels} miniaturas. Las reservas ya no se editan a mano: se consiguen reclutando y se pierden con las bajas en batalla.</p>
      </Panel>
    </CommandShell>
  );
}
