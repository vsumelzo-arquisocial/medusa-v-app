import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { campaignQuery } from "@/lib/campaign-queries";
import { BODY_MAPS } from "@/lib/planet";
import { BODY_TEXTURES } from "@/lib/system-art";
import { bodyById, bodyName } from "@/lib/system";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { EmblemIcon } from "@/components/EmblemIcon";
import { Globe, type CellStyle } from "@/components/planet/Globe";
import { scenariosQuery } from "@/lib/games";
import { CONTINENTS, REGION_TYPES, type RegionType } from "@/lib/planet";
import { RegionBonuses } from "@/components/planet/RegionBonuses";
import { listsQuery } from "@/lib/legions/queries";
import { AttackResolution } from "@/components/planet/AttackResolution";
import { operationBlocked } from "@/lib/campaign-operations";
import { Button } from "@/components/ui/button";
import { campaignForce, campaignColor, FORCE_NAMES, FORCE_CLASSES } from "@/lib/campaign-forces";
import { CampaignLegend } from "@/components/planet/CampaignLegend";

export const Route = createFileRoute("/_authenticated/planeta/$body")({
  head: ({ params }) => ({
    meta: [
      { title: `${bodyName(params.body)} — Campaña del Sistema Medusa · Atalaya` },
      { name: "description", content: `Regiones de ${bodyName(params.body)}: zonas de desembarco, conquistas y frentes de cada bando.` },
      { property: "og:title", content: `${bodyName(params.body)} — Sistema Medusa` },
      { property: "og:description", content: `Conquista ${bodyName(params.body)} región a región.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(campaignQuery), context.queryClient.ensureQueryData(scenariosQuery)]),
  component: Planeta,
});

const ERR: Record<string, string> = {
  "approach phase": "La flota sigue en aproximación: aún no se puede aterrizar.",
  "no ship": "Necesitas una nave: créala en Nave.",
  "already landed": "Ya tienes una zona de desembarco en este planeta.",
  "region taken": "Esa región ya tiene dueño.",
  "region contested": "Esa región ya está en disputa.",
  "not adjacent": "Solo puedes avanzar a regiones vecinas de las tuyas.",
  "one neutral claim": "Ya tienes una toma neutral en curso. Espera a que termine o retírala.",
  "one player attack": "Ya tienes un ataque a otro jugador en curso. Puedes seguir tomando zonas neutrales.",
  "operation unavailable": "Esa operación ya no está disponible.",
  "own region": "Ya es tuya.",
  "ship not here": "Tu nave no está en este planeta: pon rumbo desde Mando.",
  "body locked": "Este planeta está bloqueado por el mando de campaña.",
  "battle started": "La batalla ya ha empezado: no puedes retirarte.",
};
const errMsg = (m: string) => Object.entries(ERR).find(([k]) => m.includes(k))?.[1] ?? m;

function left(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "resolviendo…";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} min`;
}

const RESULT: Record<string, string> = {
  acuerdo_atacante: "conquistada al azar por acuerdo de ambos", acuerdo_defensor: "defendida al azar por acuerdo de ambos",
  conquistada: "tomada sin oposición", azar_atacante: "ganada por el atacante (sin batalla, al azar)", azar_defensor: "resistida por el defensor (sin batalla, al azar)",
  batalla_atacante: "conquistada en batalla", batalla_defensor: "defendida en batalla", espaciopuerto_destruido: "¡Espaciopuerto destruido!",
  cancelada: "ataque al Espaciopuerto cancelado (no hubo batalla)", anulada: "anulada", retirada: "retirada", reinicio: "campaña reiniciada", bloqueo: "detenida: planeta bloqueado por el mando",
};

function Planeta() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data } = useSuspenseQuery(campaignQuery);
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);
  const qc = useQueryClient();
  const me = prof.user.id;
  const { body } = Route.useParams();
  const map = BODY_MAPS[body];
  const info = bodyById(body);
  const bodyRow = data.bodies.find((b) => b.id === body);
  const bodyOpen = bodyRow?.status === "open";
  const myShip = data.fleet.find((f) => f.user_id === me);
  const shipHere = myShip?.body_id === body;
  const bodyRegions = data.regions.filter((r) => r.body_id === body);
  const regionIds = new Set(bodyRegions.map((r) => r.id));
  const orbiting = data.fleet.filter((f) => f.body_id === body);
  const [mode, setMode] = useState<"bando" | "jugador">("jugador");
  const [sel, setSel] = useState<number | null>(null);
  const { data: lists } = useQuery(listsQuery);
  const [atkKind, setAtkKind] = useState<"normal" | "patrulla">("normal");
  const atkPoints = 2000;
  const [atkList, setAtkList] = useState("");
  const atkLists = (lists ?? []).filter((l) => l.game_system === "40k" && l.list_format === atkKind && l.points <= atkPoints);
  async function attack(regionId: number) {
    if (!atkList) { toast.error("Elige la lista con la que atacas"); return; }
    const { error } = await supabase.rpc("wh40k_attack_region", { _region: regionId, _kind: atkKind, _points: atkPoints, _list: atkList });
    if (error) { toast.error(error.message.includes("recruited") ? "Esa lista aún no es jugable: te faltan unidades por reclutar" : error.message.includes("over points") ? "La lista supera los puntos" : error.message.includes("kind") ? "La lista no es de este tipo de partida" : errMsg(error.message)); return; }
    toast.success("Desafío enviado: tenéis 7 días para jugar");
    setAtkList("");
    ["campaign", "games", "profile"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const phase = data.campaign?.phase ?? "aproximacion";
  const player = (id: string | null) => data.players.find((p) => p.id === id);
  const active = data.attacks.filter((a) => !a.resolved_at);
  const mine = bodyRegions.filter((r) => r.owner_id === me);
  const bonusRegions = data.regions.filter((r) => r.owner_id === me && r.body_id === myShip?.body_id);
  const canAct = phase === "conquista" && bodyOpen && shipHere;
  const myOps = active.filter((a) => a.attacker_id === me);
  const neutralBlocked = operationBlocked(active, me, "claim");
  const playerBlocked = operationBlocked(active, me, "attack");
  const incomingAttacks = active.filter((a) => a.defender_id === me);
  const hasShip = data.ships.some((s) => s.user_id === me);
  const landed = mine.length > 0;

  const styleFor = (id: number): CellStyle => {
    const r = data.regions.find((x) => x.id === id);
    const contested = active.some((a) => a.region_id === id);
    const t = REGION_TYPES[(r?.type ?? "yermo") as RegionType];
    if (!r?.owner_id) return { fill: "transparent", label: t.glyph, pulse: contested };
    const p = player(r.owner_id);
    const fill = mode === "bando" ? campaignColor(campaignForce(p?.army_faction)) : p?.map_color ?? campaignColor('neutral');
    return { fill, label: r.is_spaceport ? (p?.map_emblem ?? "✈") : t.glyph, pulse: contested, stroke: r.owner_id === me ? "var(--foreground)" : undefined };
  };

  async function rpc(fn: "land_region" | "claim_region" | "cancel_campaign_operation", args?: Record<string, unknown>, ok?: string) {
    const { error } = await supabase.rpc(fn as never, args as never);
    if (error) { toast.error(errMsg(error.message)); return; }
    if (ok) toast.success(ok);
    qc.invalidateQueries({ queryKey: ["campaign"] });
    qc.invalidateQueries({ queryKey: ["games"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  const ranking = data.players.map((p) => ({ p, n: bodyRegions.filter((r) => r.owner_id === p.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const region = sel != null ? bodyRegions.find((r) => r.id === sel) : null;
  const adjacent = region ? mine.some((m) => m.neighbors.includes(region.id)) : false;
  const regionOp = region ? active.find((a) => a.region_id === region.id) : null;

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Campaña nº {data.campaign?.number ?? 1}</p>
          <h1 className="text-2xl text-primary glow md:text-3xl">{info?.name ?? body}</h1>
          <p className="text-xs text-muted-foreground"><Link to="/sistema" className="text-primary underline">← Sistema Medusa</Link> · {info?.biome} · {bodyOpen ? "Abierto a la conquista" : "Bloqueado"}</p>
        </div>
        <div className={`border px-3 py-1 text-xs uppercase ${phase === "conquista" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
          {phase === "conquista" ? "Fase de conquista" : phase === "finalizada" ? "Campaña finalizada" : "Fase 0 · Preparación"}
        </div>
      </div>

      {phase !== "conquista" && (
        <Panel><p>&gt; Las flotas aún se reúnen en el Sistema Medusa. Nadie puede desembarcar hasta que el mando dé la orden de iniciar la campaña.</p></Panel>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="mb-2 flex items-center justify-between text-xs uppercase">
            <div className="flex gap-1">
              {(["jugador", "bando"] as const).map((m) => (
                <Button variant="outline" size="sm" key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={`border px-3 py-1 ${mode === m ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Por {m}</Button>
              ))}
            </div>
            <span className="text-muted-foreground">Arrastra para girar</span>
          </div>
          {!map ? <p className="text-sm text-muted-foreground">&gt; Este cuerpo celeste no tiene regiones.</p> : <Globe map={map} texture={BODY_TEXTURES[body]} styleFor={styleFor} selected={sel} onSelect={setSel} attacks={active.map((a) => {
            const own = data.regions.filter((r) => r.owner_id === a.attacker_id);
            const from = own.find((r) => r.neighbors.includes(a.region_id)) ?? own.find((r) => r.is_spaceport) ?? own[0];
            return { id: a.id, from: from?.id ?? null, to: a.region_id, color: player(a.attacker_id)?.map_color ?? campaignColor(campaignForce(player(a.attacker_id)?.army_faction)), mine: a.attacker_id === me, traitor: campaignForce(player(a.attacker_id)?.army_faction) === "chaos" };
          })} />}
          <div className="mt-2"><CampaignLegend regions={bodyRegions} players={data.players} /></div>
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Tus bonificaciones · todos tus planetas, menos cuanto más lejos de la nave</p>
            <RegionBonuses owned={bonusRegions.map((r) => r.type)} />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title={region ? region.name : "Región"}>
            {!region && <p className="text-sm text-muted-foreground">&gt; Pulsa una región del globo.</p>}
            {region && (() => {
              const t = REGION_TYPES[region.type as RegionType];
              const owner = player(region.owner_id);
              return (
                <div className="space-y-2 text-sm">
                  <p className="text-primary">{t.glyph} {t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.bonus}</p>
                  <p className="text-xs">Continente: <span className="text-primary">{body === "medusa-5" ? CONTINENTS[region.continent] ?? "—" : `Masa ${region.continent + 1}`}</span></p>
                  <p className="text-xs">Campo de batalla: <span className="text-primary">{scenarios.find((x) => x.id === region.scenario_id)?.name ?? "aleatorio"}</span></p>
                  {(() => {
                    const c = map?.cells[map.index.get(region.id) ?? -1];
                    return c?.sea.length ? <div className="space-y-1 border-y border-border py-2">
                      <p className="text-xs text-muted-foreground">Rutas marítimas a:</p>
                      {c.sea.map((id) => <Button key={id} variant="link" size="sm" className="h-auto w-full justify-start whitespace-normal px-0 text-left text-xs" onClick={() => setSel(id)}>
                        ↗ {bodyRegions.find((r) => r.id === id)?.name ?? `Región ${id}`}
                      </Button>)}
                    </div> : null;
                  })()}
                   <p>Dueño: {owner ? <><EmblemIcon id={owner.map_emblem} color={owner.map_color} size={16} /> {owner.leader_name} {(() => { const force = campaignForce(owner.army_faction); return force ? <span className={`text-xs ${FORCE_CLASSES[force]}`}>({FORCE_NAMES[force]})</span> : null; })()}</> : region.owner_id ? "Jugador" : "Neutral"}</p>
                  {region.is_spaceport && <p className="text-xs uppercase text-primary">✈ Espaciopuerto · solo cae en batalla real</p>}
                  {regionOp && <p className="text-xs text-primary">⚔ {regionOp.kind === "claim" ? "En toma" : "En disputa"} por {player(regionOp.attacker_id)?.leader_name} · {left(regionOp.deadline)}</p>}
                  {canAct && !landed && !region.owner_id && !regionOp && (
                    <button disabled={!hasShip} onClick={() => rpc("land_region", { _region: region.id }, "Espaciopuerto establecido")} className="w-full border border-primary px-3 py-2 text-xs uppercase text-primary disabled:opacity-40">
                      Desembarcar aquí (zona de desembarco)
                    </button>
                  )}
                  {phase === "conquista" && region.owner_id !== me && !regionOp && !canAct && <p className="text-xs text-muted-foreground">{!bodyOpen ? "Planeta bloqueado: no se puede desembarcar ni atacar." : "Tu nave no está estacionada aquí. Pon rumbo desde Mando para poder actuar."}</p>}
                  {canAct && landed && region.owner_id !== me && !regionOp && (
                    adjacent ? (
                      region.owner_id ? (
                        <div className="space-y-2">
                          <div className="flex gap-1">
                            {(["normal", "patrulla"] as const).map((k) => <button key={k} onClick={() => { setAtkKind(k); setAtkList(""); }} className={`flex-1 border px-2 py-1 text-xs uppercase ${atkKind === k ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{k === "normal" ? "Batalla normal" : "Patrulla"}</button>)}
                          </div>
                          <select value={atkList} onChange={(e) => setAtkList(e.target.value)} className="w-full border border-border bg-background px-2 py-1 text-xs">
                            <option value="">— Lista para el ataque —</option>
                            {atkLists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.points} pts)</option>)}
                          </select>
                          {!atkLists.length && <p className="text-xs text-muted-foreground">No tienes listas de este tipo. <Link to="/listas" className="text-primary underline">Importar una</Link></p>}
                          <Button variant="outline" disabled={playerBlocked || !atkList} onClick={() => attack(region.id)} className="h-auto w-full whitespace-normal border-destructive px-3 py-2 text-xs uppercase text-destructive disabled:opacity-40">
                            Atacar (batalla en 7 días, tu lista queda oculta)
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" disabled={neutralBlocked} onClick={() => rpc("claim_region", { _region: region.id }, "Toma iniciada: será tuya en 1 día")} className="h-auto w-full whitespace-normal border-primary px-3 py-2 text-xs uppercase text-primary disabled:opacity-40">
                          Reclamar (1 día)
                        </Button>
                      )
                    ) : <p className="text-xs text-muted-foreground">No es vecina de tus regiones.</p>
                  )}
                </div>
              );
            })()}
          </Panel>

          {phase === "conquista" && (
            <Panel title="Tus operaciones">
              {!hasShip && <p className="text-sm">&gt; Necesitas una nave. <Link to="/nave" className="text-primary underline">Ir a Nave</Link></p>}
              {hasShip && !shipHere && <p className="text-sm">&gt; Tu nave está {myShip?.body_id ? `en ${bodyName(myShip.body_id)}` : "en el warp"}. <Link to="/mando" className="text-primary underline">Poner rumbo</Link></p>}
              {hasShip && shipHere && bodyOpen && !landed && <p className="text-sm">&gt; Elige una región neutral libre para establecer tu zona de desembarco.</p>}
              {landed && <div className="space-y-1 text-xs text-muted-foreground">
                <p>Toma neutral: {neutralBlocked ? "1 / 1 en curso" : "0 / 1 en curso"}</p>
                <p>Ataque a jugador: {playerBlocked ? "1 / 1 en curso" : "0 / 1 en curso"}</p>
              </div>}
              {myOps.map((myOp) => (
                <div key={myOp.id} className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                  <p>{myOp.kind === "claim" ? "Tomando" : "Atacando"} {data.regions.find((r) => r.id === myOp.region_id)?.name} <span className="text-xs text-muted-foreground">({bodyName(data.regions.find((r) => r.id === myOp.region_id)?.body_id)})</span></p>
                  <p className="text-xs text-muted-foreground">Quedan {left(myOp.deadline)}</p>
                  {myOp.game_id && <Link to="/partidas" className="block text-xs text-primary underline">Ver desafío en Partidas</Link>}
                  {myOp.game_id && <AttackResolution gameId={myOp.game_id} me={me} />}
                  <Button variant="outline" onClick={() => rpc("cancel_campaign_operation", { _attack: myOp.id }, "Operación retirada")} className="w-full text-xs uppercase">{myOp.kind === "claim" ? "Retirar toma neutral" : "Retirar ataque"}</Button>
                </div>
              ))}
              {landed && <p className="mt-2 text-xs text-muted-foreground">Tus regiones: {mine.length}</p>}
            </Panel>
          )}

          {!!incomingAttacks.length && <Panel title="Ataques contra tus regiones">
            {incomingAttacks.map((a) => <div key={a.id} className="mb-3 text-sm">
              <p>{player(a.attacker_id)?.leader_name} → {data.regions.find((r) => r.id === a.region_id)?.name} <span className="text-xs text-muted-foreground">({bodyName(data.regions.find((r) => r.id === a.region_id)?.body_id)})</span></p>
              <p className="text-xs text-muted-foreground">Quedan {left(a.deadline)}</p>
              {data.regions.find((r) => r.id === a.region_id)?.is_spaceport && <p className="text-xs text-primary">Espaciopuerto · requiere batalla real</p>}
              {a.game_id && <AttackResolution gameId={a.game_id} me={me} />}
            </div>)}
          </Panel>}

          <Panel title="Tu estandarte"><p className="text-xs text-muted-foreground">Cambia tu color y emblema en tu <Link to="/perfil" className="text-primary underline">Perfil</Link>.</p></Panel>

          <Panel title={`Naves en órbita (${orbiting.length})`}>
            {!orbiting.length && <p className="text-sm text-muted-foreground">&gt; Ninguna nave localizada aquí.</p>}
            <ul className="space-y-1 text-sm">{orbiting.map((f) => <li key={f.user_id}><EmblemIcon id={f.map_emblem} color={f.map_color} size={16} /> {f.name} · {f.leader_name}</li>)}</ul>
          </Panel>

          <Panel title={`Señores de ${info?.name ?? body}`}>
            {!ranking.length && <p className="text-sm text-muted-foreground">&gt; Nadie ha aterrizado aún.</p>}
            <ul className="space-y-1 text-sm">
              {ranking.map(({ p, n }) => (
                <li key={p.id} className="flex justify-between"><span><EmblemIcon id={p.map_emblem} color={p.map_color} size={18} /> {p.leader_name}</span><span className="text-primary">{n}</span></li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title="Crónica de la campaña">
        <ul className="space-y-1 text-xs">
          {data.attacks.filter((a) => a.resolved_at && regionIds.has(a.region_id)).slice(0, 15).map((a) => (
            <li key={a.id}>&gt; {data.regions.find((r) => r.id === a.region_id)?.name}: {player(a.attacker_id)?.leader_name}{a.defender_id ? ` contra ${player(a.defender_id)?.leader_name}` : ""} — {RESULT[a.result ?? ""] ?? a.result}</li>
          ))}
          {!data.attacks.some((a) => a.resolved_at) && <li className="text-muted-foreground">&gt; Sin acontecimientos.</li>}
        </ul>
      </Panel>
    </CommandShell>
  );
}

