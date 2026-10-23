import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { profileQuery } from "@/lib/profile";
import { playersQuery, STATUS_LABEL } from "@/lib/games";
import { datasheetsQuery, findSheet, type Datasheet } from "@/lib/wh40k-units";
import type { RosterUnit } from "@/lib/wh40k-lists";
import { listsQuery } from "@/lib/legions/queries";
import { AttackResolution } from "@/components/planet/AttackResolution";
import { Button } from "@/components/ui/button";
import { canPrepareBattle } from "@/lib/battle-start";

type Side = "creator" | "opponent";
interface Loss { models: number; wounds: number }
interface Battle {
  phase?: "previa" | "batalla" | "cierre" | "finalizada" | "anulada";
  ready?: Partial<Record<Side, boolean>>;
  vp?: Record<Side, number>;
  losses?: Record<string, Loss>;
  log?: string[];
  confirm?: Partial<Record<Side, string>>;
  confirm_deadline?: string | null;
  disputed?: boolean;
  dispute_note?: string;
  result?: { winner: Side | "empate"; reason: string } | null;
}
interface GameRow {
  id: string; creator_id: string; opponent_id: string | null; points: number; battle_type: string;
  status: string; scheduled_at: string | null; notes: string; region_id: number | null; battle: Battle | null;
}
interface StateList { side: Side; id: string; name: string; points: number; list_format: string; army_faction: string | null; owner_id: string; roster: { units?: RosterUnit[] } | null }
interface Squad { id: string; user_id: string; faction: string; unit_name: string; models: number; models_alive: number; wounds_max: number | null; wounds_left: number | null; nickname: string; status: string }
interface GameState { game: GameRow; lists: StateList[]; squads: Squad[] }

const gameStateQuery = (id: string) => queryOptions({
  queryKey: ["wh40k-game-state", id],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("wh40k_game_state", { _game: id });
    if (error) throw error;
    return data as unknown as GameState;
  },
  refetchInterval: 5000,
});

export const Route = createFileRoute("/_authenticated/partidas/$id")({
  head: () => ({
    meta: [
      { title: "Asistente de batalla — Atalaya" },
      { name: "description", content: "Puntos de victoria, bajas y estado de tus unidades en la batalla." },
      { property: "og:title", content: "Asistente de batalla — Atalaya" },
      { property: "og:description", content: "Dirige la batalla." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(gameStateQuery(params.id)),
    context.queryClient.ensureQueryData(playersQuery), context.queryClient.ensureQueryData(listsQuery),
  ]),
  component: BattlePage,
});

const btn = "border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary";
const norm = (s: string) => s.toLowerCase().trim();

/** Pairs each roster unit with one of the owner's live squads of the same unit and size. */
function pairRoster(units: RosterUnit[], squads: Squad[]) {
  const pool = [...squads];
  return units.map((u) => {
    const i = pool.findIndex((s) => norm(s.unit_name) === norm(u.name) && s.models === u.models);
    const squad = i >= 0 ? pool.splice(i, 1)[0]! : null;
    return { unit: u, squad };
  });
}

function BattlePage() {
  const { id } = Route.useParams();
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data: state } = useSuspenseQuery(gameStateQuery(id));
  const { data: players } = useSuspenseQuery(playersQuery);
  const { data: allLists } = useSuspenseQuery(listsQuery);
  const qc = useQueryClient();
  const game = state.game;
  const me = prof.user.id;
  const mySide: Side = game.creator_id === me ? "creator" : "opponent";
  const foe: Side = mySide === "creator" ? "opponent" : "creator";
  const name = (uid: string | null) => players.find((p) => p.id === uid)?.leader_name ?? "—";
  const sideName: Record<Side, string> = { creator: name(game.creator_id), opponent: name(game.opponent_id) };

  const [b, setB] = useState<Battle>(() => ({ vp: { creator: 0, opponent: 0 }, losses: {}, log: [], ...(game.battle ?? {}) }));
  const dirty = useRef(false);
  const [disputeNote, setDisputeNote] = useState("");
  useEffect(() => { if (!dirty.current) setB({ vp: { creator: 0, opponent: 0 }, losses: {}, log: [], ...(game.battle ?? {}) }); }, [game.battle]);

  const phase = b.phase ?? "previa";
  const active = phase === "batalla" || phase === "cierre";
  const disputed = !!b.disputed;
  const refresh = () => qc.invalidateQueries({ queryKey: ["wh40k-game-state", id] });
  const myLists = allLists.filter((l) => l.game_system === "40k" && l.list_format === game.battle_type && l.points <= game.points);
  const [pick, setPick] = useState(() => state.lists.find((l) => l.side === mySide)?.id ?? "");
  async function setList() {
    if (!pick) { toast.error("Elige una lista"); return; }
    const { error } = await supabase.rpc("wh40k_set_game_list", { _game: id, _list: pick });
    if (error) { toast.error(error.message.includes("recruited") ? "Esa lista aún no es jugable: te faltan unidades por reclutar" : "No se pudo guardar la lista"); return; }
    toast.success("Lista de batalla guardada");
    refresh(); qc.invalidateQueries({ queryKey: ["games"] });
  }

  async function save(next: Battle) {
    setB(next); dirty.current = true;
    const { error } = await supabase.rpc("wh40k_save_battle", { _game: id, _battle: next as never });
    dirty.current = false;
    if (error) toast.error("No se pudo guardar");
  }
  async function ready() {
    const { error } = await supabase.rpc("wh40k_battle_ready", { _game: id });
    if (error) { toast.error(error.message.includes("list required") ? "Guarda tu lista antes de iniciar" : error.message.includes("lists") ? "Ambos jugadores deben tener lista asignada" : error.message.includes("recruited") ? "Te faltan unidades por reclutar para tu lista" : "No se pudo marcar como listo"); return; }
    await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["games"] })]);
  }
  async function confirmEnd() {
    const { error } = await supabase.rpc("wh40k_confirm_end", { _game: id });
    if (error) { toast.error("No se pudo confirmar"); return; }
    toast.success("Has confirmado el resultado");
    refresh();
  }
  async function dispute() {
    const { error } = await supabase.rpc("wh40k_dispute", { _game: id, _note: disputeNote });
    if (error) { toast.error("No se pudo impugnar"); return; }
    toast.success("Resultado impugnado: queda congelado hasta que un administrador decida");
    refresh();
  }

  const setVp = (s: Side, delta: number) => {
    if (!active || disputed) return;
    const vp = { creator: 0, opponent: 0, ...(b.vp ?? {}) };
    vp[s] = Math.max(0, (vp[s] ?? 0) + delta);
    save({ ...b, vp });
  };
  const setLoss = (squad: Squad, patch: Partial<Loss>) => {
    if (!active || disputed) return;
    const cur = b.losses?.[squad.id] ?? { models: 0, wounds: 0 };
    const next: Loss = {
      models: Math.max(0, Math.min(squad.models_alive, patch.models ?? cur.models)),
      wounds: Math.max(0, Math.min(squad.wounds_left ?? 0, patch.wounds ?? cur.wounds)),
    };
    save({ ...b, losses: { ...(b.losses ?? {}), [squad.id]: next } });
  };

  const sideList = (s: Side) => state.lists.find((l) => l.side === s);
  const sideSquads = (s: Side) => state.squads.filter((x) => x.user_id === (s === "creator" ? game.creator_id : game.opponent_id));
  const lost = (sq: Squad): Loss => b.losses?.[sq.id] ?? { models: 0, wounds: 0 };
  const isDead = (sq: Squad) => { const l = lost(sq); return l.models >= sq.models_alive || (sq.wounds_left !== null && l.wounds >= sq.wounds_left); };

  const UnitPanel = ({ s }: { s: Side }) => {
    const l = sideList(s);
    const mine = s === mySide;
    const { data: sheets } = useSuspenseQuery(datasheetsQuery(l?.army_faction ?? ""));
    const rows = pairRoster(l?.roster?.units ?? [], sideSquads(s).filter((x) => ["ready", "damaged"].includes(x.status)));
    return (
      <Panel title={`${mine ? "Tus unidades" : "Unidades de " + sideName[s]}${l ? ` · ${l.name}` : ""}`}>
        {!l && <p className="text-sm text-muted-foreground">&gt; Sin lista asignada.</p>}
        {l && !l.roster && <p className="text-sm text-muted-foreground">&gt; Lista oculta: se revelará al iniciar la batalla.</p>}
        <ul className="space-y-2">
          {rows.map(({ unit, squad }, i) => {
            const sheet: Datasheet | undefined = findSheet(sheets, unit.name);
            const dead = squad ? isDead(squad) : false;
            const l0 = squad ? lost(squad) : { models: 0, wounds: 0 };
            const edit = !!squad && active && mine && !disputed;
            const multi = !!squad && squad.models_alive > 1;
            const wMax = squad?.wounds_max ?? 0;
            const wLeft = squad ? Math.max(0, (squad.wounds_left ?? 0) - l0.wounds) : 0;
            const alive = squad ? squad.models_alive - l0.models : 0;
            const pct = wMax ? Math.round((wLeft / wMax) * 100) : 0;
            return (
              <li key={squad?.id ?? `u${i}`} className={`relative overflow-hidden border p-2 text-xs ${dead ? "border-destructive" : "border-border"}`}>
                {dead && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                    <span className="animate-pulse font-display text-destructive glow">▚▞ SEÑAL PERDIDA · SIN CONTACTO ▞▚</span>
                  </div>
                )}
                <div className={dead ? "opacity-30 blur-[1px]" : ""}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${dead ? "line-through" : ""}`}>
                      {squad?.nickname ? <span className="text-primary">«{squad.nickname}» </span> : null}{unit.name}
                      {unit.warlord && <span className="ml-1 text-primary">★</span>}
                    </span>
                    {!squad && <span className="text-destructive">sin ficha</span>}
                    {squad && <span className="shrink-0 text-muted-foreground">{multi ? `${alive}/${squad.models_alive} min.` : wMax ? `${wLeft}/${wMax} H` : ""}</span>}
                  </div>

                  {squad && multi && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Array.from({ length: squad.models_alive }, (_, k) => {
                        const gone = k >= alive;
                        return (
                          <button key={k} type="button" disabled={!edit}
                            title={gone ? "Baja" : "Miniatura en pie"}
                            onClick={() => setLoss(squad, { models: gone ? squad.models_alive - k - 1 : squad.models_alive - k })}
                            className={`h-4 w-4 border ${gone ? "border-destructive bg-destructive/30 text-[9px] leading-3 text-destructive" : "border-primary bg-primary/60"} ${edit ? "cursor-pointer hover:opacity-70" : "cursor-default"}`}>
                            {gone ? "✕" : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {squad && wMax > 1 && (
                    <div className="mt-2">
                      {multi && <div className="mb-1 text-[10px] text-muted-foreground">Heridas de la miniatura herida</div>}
                      {!multi && (
                        <div className="mb-1 h-2 w-full overflow-hidden border border-border bg-muted">
                          <div className={`h-full transition-all ${pct > 50 ? "bg-primary" : pct > 25 ? "bg-accent-foreground" : "bg-destructive"}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-0.5">
                        {Array.from({ length: wMax }, (_, k) => {
                          const hurt = k >= wLeft;
                          return (
                            <button key={k} type="button" disabled={!edit}
                              onClick={() => setLoss(squad, { wounds: hurt ? (squad.wounds_left ?? 0) - k - 1 : (squad.wounds_left ?? 0) - k })}
                              className={`h-2.5 w-3 ${hurt ? "bg-destructive/40" : "bg-primary/70"} ${edit ? "cursor-pointer hover:opacity-70" : "cursor-default"}`} />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(edit || !!sheet?.weapons.length) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {edit && multi && <button className={btn} onClick={() => setLoss(squad!, { models: l0.models + 1 })}>− Miniatura</button>}
                      {edit && wMax > 1 && <button className={btn} onClick={() => setLoss(squad!, { wounds: l0.wounds + 1 })}>− Herida</button>}
                      {edit && !dead && <button className={`${btn} text-destructive`} onClick={() => setLoss(squad!, { models: squad!.models_alive, wounds: squad!.wounds_left ?? 0 })}>Destruida</button>}
                      {!!sheet?.weapons.length && (
                        <details className="w-full text-muted-foreground">
                          <summary className="cursor-pointer hover:text-primary">Armas ({sheet.weapons.length})</summary>
                          <div className="mt-1">{sheet.weapons.map((w) => w.name).join(" · ")}</div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {l?.roster && !rows.length && <li className="text-muted-foreground">&gt; La lista no tiene unidades.</li>}
        </ul>
      </Panel>
    );
  };

  const [tab, setTab] = useState<"vp" | "mine" | "foe">("vp");
  const Tabs = () => (
    <div className="mb-4 flex border border-border">
      {([["vp", `Puntos de victoria · ${b.vp?.[mySide] ?? 0}–${b.vp?.[foe] ?? 0}`], ["mine", "Mis unidades"], ["foe", `Unidades de ${sideName[foe]}`]] as const).map(([k, label]) => (
        <button key={k} onClick={() => setTab(k)}
          className={`flex-1 px-3 py-2 text-xs uppercase tracking-wider ${tab === k ? "bg-accent text-primary glow" : "text-muted-foreground hover:text-primary"}`}>{label}</button>
      ))}
    </div>
  );
  const myConfirmed = !!b.confirm?.[mySide];
  const foeConfirmed = !!b.confirm?.[foe];

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="mb-4">
        <Link to="/partidas" className="text-xs text-muted-foreground hover:text-primary">&lt; Partidas</Link>
        <h1 className="font-display text-xl text-primary glow">{sideName.creator} vs {sideName.opponent}</h1>
        <p className="text-xs text-muted-foreground">
          {game.battle_type === "patrulla" ? "Patrulla de combate" : "Partida normal"} · {game.points} pts · [{STATUS_LABEL[game.status]}]
          {game.scheduled_at && <> · {new Date(game.scheduled_at).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" })}</>}
        </p>
      </div>

      {phase === "previa" && ["abierta", "aceptada"].includes(game.status) && (
        <Panel title={game.region_id !== null && mySide === "opponent" ? "Defensa de tu región" : "Tu lista para esta batalla"}>
          <p className="mb-2 text-xs text-muted-foreground">
            Lista actual: {sideList(mySide) ? <span className="text-primary">{sideList(mySide)!.name} · {sideList(mySide)!.points} pts</span> : <span className="text-destructive">sin elegir</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="border border-border bg-background px-2 py-1 text-xs">
              <option value="">— Elige lista ({game.battle_type === "patrulla" ? "patrulla" : "normal"}, ≤{game.points} pts) —</option>
              {myLists.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.points} pts</option>)}
            </select>
            <button onClick={setList} className="border border-primary px-3 py-1 text-xs text-primary hover:bg-accent">{sideList(mySide) ? "Cambiar lista" : "Usar esta lista"}</button>
          </div>
          {!myLists.length && <p className="mt-2 text-xs text-destructive">No tienes listas de este tipo dentro de {game.points} pts. Impórtala en Listas.</p>}
          {game.region_id !== null && <AttackResolution gameId={game.id} me={me} />}
        </Panel>
      )}

      {phase === "previa" && canPrepareBattle(game) && (
        <Panel title="Antes de la batalla">
          <p className="mb-3 text-sm text-muted-foreground">Las listas están ocultas. La batalla comienza cuando ambos jugadores pulsen «Iniciar batalla»; entonces se revelarán.</p>
          <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
            {(["creator", "opponent"] as Side[]).map((s) => (
              <div key={s} className="border border-border p-2">
                {sideName[s]}: {b.ready?.[s] ? <span className="text-primary">✔ listo</span> : <span className="text-muted-foreground">esperando…</span>}
              </div>
            ))}
          </div>
          {!b.ready?.[mySide] && <Button variant="outline" disabled={!sideList(mySide)} onClick={ready}>Iniciar batalla</Button>}
          {!sideList(mySide) && <p className="mt-2 text-xs text-muted-foreground">Elige y guarda tu lista para iniciar.</p>}
          {b.ready?.[mySide] && <p className="text-xs text-muted-foreground">Esperando a tu rival…</p>}
        </Panel>
      )}

      {disputed && (
        <div className="mb-4 border border-destructive p-3 text-center text-sm text-destructive glow-box">
          ⚠ RESULTADO IMPUGNADO{b.dispute_note ? ` · «${b.dispute_note}»` : ""} — congelado hasta que un administrador lo aplique o lo elimine.
        </div>
      )}
      {phase === "finalizada" && b.result && (
        <div className="mb-4 border border-primary p-3 text-center glow-box">
          <div className="font-display text-xl text-primary glow">{b.result.winner === "empate" ? "EMPATE" : `VICTORIA DE ${sideName[b.result.winner].toUpperCase()}`}</div>
          <div className="text-xs text-muted-foreground">{b.vp?.creator ?? 0} – {b.vp?.opponent ?? 0} PV · las bajas ya se han aplicado a las fichas</div>
        </div>
      )}
      {phase === "anulada" && <div className="mb-4 border border-border p-3 text-center text-sm text-muted-foreground">Resultado eliminado por un administrador.</div>}

      {active && (
        <>
          <Tabs />
          <div className="mx-auto max-w-2xl">
            {tab === "vp" && <Panel title="Puntos de victoria">
              {(["creator", "opponent"] as Side[]).map((s) => (
                <div key={s} className="mb-3 flex items-center justify-between gap-2 border border-border p-2">
                  <span className={`text-sm ${s === mySide ? "text-primary" : ""}`}>{sideName[s]}{s === mySide && " (tú)"}</span>
                  <span className="flex items-center gap-2">
                    {!disputed && <button className={btn} onClick={() => setVp(s, -1)}>−</button>}
                    <span className="w-10 text-center text-xl text-primary glow">{b.vp?.[s] ?? 0}</span>
                    {!disputed && <button className={btn} onClick={() => setVp(s, 1)}>+</button>}
                  </span>
                </div>
              ))}
              <div className="mt-4 border-t border-border pt-3 text-xs">
                <div className="mb-2 uppercase text-muted-foreground">Cierre de la batalla</div>
                <div className="mb-2">{sideName[mySide]} (tú): {myConfirmed ? <span className="text-primary">✔ confirmado</span> : "pendiente"}</div>
                <div className="mb-2">{sideName[foe]}: {foeConfirmed ? <span className="text-primary">✔ confirmado</span> : "pendiente"}</div>
                {b.confirm_deadline && !b.result && (
                  <p className="mb-2 text-muted-foreground">Si falta una confirmación, se aplicará automáticamente el {new Date(b.confirm_deadline).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}.</p>
                )}
                {!disputed && (
                  <div className="flex flex-wrap gap-2">
                    {!myConfirmed && <button onClick={confirmEnd} className="border border-primary px-3 py-1 text-xs text-primary hover:bg-accent">Confirmar resultado</button>}
                    {(myConfirmed || foeConfirmed) && (
                      <button onClick={() => { const note = prompt("Motivo de la impugnación:", disputeNote); if (note !== null) { setDisputeNote(note); setTimeout(dispute, 0); } }} className="border border-destructive px-3 py-1 text-xs text-destructive">Impugnar</button>
                    )}
                  </div>
                )}
              </div>
            </Panel>}
            {tab === "mine" && <UnitPanel s={mySide} />}
            {tab === "foe" && <UnitPanel s={foe} />}
          </div>
          {tab === "vp" && !!b.log?.length && (
            <Panel title="Registro">
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">{b.log.map((l, i) => <li key={i}>&gt; {l}</li>)}</ul>
            </Panel>
          )}
        </>
      )}
      {phase === "finalizada" && (
        <div className="mx-auto max-w-2xl">
          <Tabs />
          {tab !== "foe" ? <UnitPanel s={mySide} /> : <UnitPanel s={foe} />}
        </div>
      )}
    </CommandShell>
  );
}
