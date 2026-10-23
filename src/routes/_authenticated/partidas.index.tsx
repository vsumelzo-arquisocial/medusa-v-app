import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { profileQuery } from "@/lib/profile";
import { listsQuery } from "@/lib/legions/queries";
import { gamesQuery, playersQuery, STATUS_LABEL } from "@/lib/games";
import { BattleCompendium, compendiumQuery } from "@/components/games/BattleCompendium";
import { AttackResolution } from "@/components/planet/AttackResolution";
import { canPrepareBattle } from "@/lib/battle-start";

export const Route = createFileRoute("/_authenticated/partidas/")({
  head: () => ({
    meta: [
      { title: "Gestor de partidas — Atalaya" },
      { name: "description", content: "Lanza desafíos de Warhammer 40.000 abiertos o directos y organiza tus batallas." },
      { property: "og:title", content: "Gestor de partidas — Atalaya" },
      { property: "og:description", content: "Lanza desafíos y organiza batallas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(gamesQuery),
    context.queryClient.ensureQueryData(playersQuery), context.queryClient.ensureQueryData(listsQuery),
    context.queryClient.ensureQueryData(compendiumQuery),
  ]),
  component: Partidas,
});

const inputCls = "w-full border border-border bg-background px-3 py-2 text-sm";
const KIND_LABEL: Record<string, string> = { normal: "Normal", patrulla: "Patrulla de combate" };

function Partidas() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data: games } = useSuspenseQuery(gamesQuery);
  const { data: players } = useSuspenseQuery(playersQuery);
  const { data: lists } = useSuspenseQuery(listsQuery);
  const qc = useQueryClient();
  const me = prof.user.id;
  const others = players.filter((p) => p.id !== me);
  const name = (id: string | null) => players.find((p) => p.id === id)?.leader_name ?? "—";

  const [kind, setKind] = useState<"libre" | "directa">("libre");
  const [battleType, setBattleType] = useState<"normal" | "patrulla">("normal");
  const [points, setPoints] = useState(2000);
  const [opponent, setOpponent] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [listId, setListId] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [acceptList, setAcceptList] = useState<Record<string, string>>({});
  const [editList, setEditList] = useState<Record<string, string>>({});

  const my40kLists = lists.filter((l) => l.game_system === "40k");
  const createLists = my40kLists.filter((l) => l.list_format === battleType && l.points <= points);

  const refresh = () => qc.invalidateQueries({ queryKey: ["games"] });

  async function create() {
    if (kind === "directa" && !opponent) { toast.error("Elige un rival"); return; }
    if (!date || !time) { toast.error("Indica el día y la hora de la batalla"); return; }
    if (!listId) { toast.error("Debes elegir una lista: quedará oculta hasta que empiece la batalla"); return; }
    const { error } = await supabase.rpc("wh40k_create_game", {
      _kind: battleType, _points: points, ...(kind === "directa" ? { _opponent: opponent } : {}),
      _list: listId, _notes: notes, _scheduled: new Date(`${date}T${time}`).toISOString(),
      _excluded: kind === "libre" ? excluded : [],
    } as never);
    if (error) { toast.error(error.message.includes("recruited") ? "Esa lista aún no es jugable: te faltan unidades por reclutar" : error.message.includes("kind") ? "La lista no es de este tipo de partida" : error.message.includes("points") ? "La lista supera los puntos de la partida" : "No se pudo crear la partida"); return; }
    toast.success("Desafío lanzado");
    setNotes(""); setExcluded([]); setOpponent(""); setListId("");
    refresh();
  }

  async function respond(id: string, accept: boolean) {
    const g = games.find((x) => x.id === id);
    if (accept && !acceptList[id]) { toast.error("Elige la lista con la que vas a jugar"); return; }
    if (accept && g) {
      const l = my40kLists.find((x) => x.id === acceptList[id]);
      if (l && l.list_format !== g.battle_type) { toast.error(`Esta partida es de tipo ${KIND_LABEL[g.battle_type] ?? g.battle_type}: elige una lista acorde`); return; }
    }
    const { error } = await supabase.rpc("respond_game", { _game: id, _accept: accept, ...(acceptList[id] ? { _list: acceptList[id] } : {}) });
    if (error) { toast.error(error.message.includes("recruited") ? "Esa lista aún no es jugable: te faltan unidades por reclutar" : "No se pudo responder al desafío"); return; }
    toast.success(accept ? "¡Desafío aceptado!" : "Desafío rechazado");
    refresh();
  }
  async function changeList(id: string) {
    const l = editList[id];
    if (!l) { toast.error("Elige una lista"); return; }
    const { error } = await supabase.rpc("wh40k_set_game_list", { _game: id, _list: l });
    if (error) { toast.error("No se pudo cambiar la lista"); return; }
    toast.success("Lista actualizada");
    refresh();
  }
  async function cancel(id: string) {
    await supabase.from("games").update({ status: "cancelada" }).eq("id", id);
    refresh();
  }

  const inGame = (g: (typeof games)[number]) => [g.creator_id, g.opponent_id].includes(me);
  const incoming = games.filter((g) => g.status === "abierta" && !g.opponent_id && !inGame(g));
  const directed = games.filter((g) => g.status === "abierta" && g.opponent_id === me);
  const mine = games.filter(inGame);

  const GameRow = ({ g, children }: { g: (typeof games)[number]; children?: React.ReactNode }) => (
    <li className="border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-primary">{KIND_LABEL[g.battle_type] ?? "Normal"} · {g.points} pts</span>
          <span className="ml-2 text-xs text-muted-foreground">[{STATUS_LABEL[g.status]}]</span>
        </div>
        <div className="text-xs text-muted-foreground">{name(g.creator_id)} vs {g.opponent_id ? name(g.opponent_id) : "cualquiera"}</div>
      </div>
      {g.scheduled_at && <div className="mt-1 text-xs text-primary">⏱ {new Date(g.scheduled_at).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" })}</div>}
      {g.notes && <div className="mt-1 text-xs text-muted-foreground">&gt; {g.notes}</div>}
      {children}
      {g.region_id !== null && <AttackResolution gameId={g.id} me={me} />}
    </li>
  );

  const listSelect = (g: (typeof games)[number], value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-border bg-background px-2 py-1 text-xs">
      <option value="">— Tu lista ({KIND_LABEL[g.battle_type] ?? "normal"}) —</option>
      {my40kLists.filter((l) => l.list_format === g.battle_type && l.points <= g.points).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.points} pts)</option>)}
    </select>
  );

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Panel title="Nuevo desafío">
          <div className="mb-3 grid grid-cols-2 border border-border text-xs uppercase">
            {(["libre", "directa"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`px-2 py-2 ${kind === k ? "bg-accent text-primary" : "text-muted-foreground"}`}>
                {k === "libre" ? "Abierto a todos" : "Jugador concreto"}
              </button>
            ))}
          </div>
          <label className="text-xs uppercase text-muted-foreground">Tipo de partida</label>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["normal", "patrulla"] as const).map((t) => (
              <button key={t} onClick={() => { setBattleType(t); setListId(""); }} className={`border p-2 text-xs ${battleType === t ? "border-primary bg-accent text-primary" : "border-border"}`}>
                {KIND_LABEL[t]}
              </button>
            ))}
          </div>
          <label className="text-xs uppercase text-muted-foreground">Puntos</label>
          <input type="number" min={100} max={10000} step={50} value={points} onChange={(e) => setPoints(Math.max(100, Math.min(10000, +e.target.value || 2000)))} className={`${inputCls} mb-3`} />
          {kind === "directa" ? (
            <>
              <label className="text-xs uppercase text-muted-foreground">Rival</label>
              <select value={opponent} onChange={(e) => setOpponent(e.target.value)} className={`${inputCls} mb-3`}>
                <option value="">— Elige jugador —</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.leader_name} · {p.force_name}</option>)}
              </select>
            </>
          ) : (
            <details className="mb-3 border border-border p-2 text-xs">
              <summary className="cursor-pointer">No jugar contra… ({excluded.length}) — no verán el desafío</summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {others.map((p) => (
                  <li key={p.id}><label className="flex gap-2">
                    <input type="checkbox" checked={excluded.includes(p.id)} onChange={(e) => setExcluded(e.target.checked ? [...excluded, p.id] : excluded.filter((x) => x !== p.id))} />
                    {p.leader_name} · {p.force_name}
                  </label></li>
                ))}
                {!others.length && <li className="text-muted-foreground">No hay otros jugadores aún.</li>}
              </ul>
            </details>
          )}
          <label className="text-xs uppercase text-muted-foreground">Tu lista (obligatoria, oculta hasta la batalla)</label>
          <select value={listId} onChange={(e) => setListId(e.target.value)} className={`${inputCls} mb-1`}>
            <option value="">— Elige lista de {KIND_LABEL[battleType]} —</option>
            {createLists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.points} pts)</option>)}
          </select>
          {!createLists.length && <p className="mb-1 text-[11px] text-muted-foreground">No tienes listas de tipo {KIND_LABEL[battleType]} de {points} pts o menos. Impórtala en Listas.</p>}
          <p className="mb-3 text-[11px] text-muted-foreground">Tu rival no verá la lista hasta que ambos iniciéis la batalla. Podrás cambiarla en cualquier momento antes de iniciar.</p>
          <label className="text-xs uppercase text-muted-foreground">Día y hora de la batalla</label>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas: lugar, mesa..." className={`${inputCls} mb-3`} rows={2} />
          <button onClick={create} className="w-full border border-primary px-3 py-2 text-primary hover:bg-accent">Lanzar desafío</button>
        </Panel>

        <div className="space-y-6">
          <Panel title={`Desafíos recibidos y abiertos (${incoming.length + directed.length})`}>
            {!incoming.length && !directed.length && <p className="text-sm text-muted-foreground">&gt; No hay desafíos pendientes.</p>}
            <ul className="space-y-2">
              {[...directed, ...incoming].map((g) => (
                <GameRow key={g.id} g={g}>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {listSelect(g, acceptList[g.id] ?? "", (v) => setAcceptList({ ...acceptList, [g.id]: v }))}
                    <button onClick={() => respond(g.id, true)} className="border border-primary px-3 py-1 text-xs text-primary hover:bg-accent">Aceptar</button>
                    {g.opponent_id === me && <button onClick={() => respond(g.id, false)} className="border border-border px-3 py-1 text-xs hover:text-destructive">Rechazar</button>}
                  </div>
                </GameRow>
              ))}
            </ul>
          </Panel>
          <Panel title="Mis partidas">
            {!mine.length && <p className="text-sm text-muted-foreground">&gt; Aún no tienes partidas.</p>}
            <ul className="space-y-2">
              {mine.map((g) => (
                <GameRow key={g.id} g={g}>
                  {["abierta", "aceptada"].includes(g.status) && (g.battle as { phase?: string } | null)?.phase !== "batalla" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {listSelect(g, editList[g.id] ?? ((g.creator_id === me ? g.creator_list_id : g.opponent_list_id) ?? ""), (v) => setEditList({ ...editList, [g.id]: v }))}
                      <button onClick={() => changeList(g.id)} className="border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary">Cambiar mi lista</button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(canPrepareBattle(g) || ["en_curso", "finalizada"].includes(g.status)) && g.opponent_id && (
                      <Link to="/partidas/$id" params={{ id: g.id }} className="border border-primary px-3 py-1 text-xs text-primary hover:bg-accent">
                        {canPrepareBattle(g) ? "Iniciar batalla" : g.status === "en_curso" ? "Continuar batalla" : "Ver resultado"}
                      </Link>
                    )}
                    {g.creator_id === me && (g.status === "abierta" || g.status === "aceptada") && (
                      <button onClick={() => cancel(g.id)} className="border border-border px-3 py-1 text-xs hover:text-destructive">Cancelar</button>
                    )}
                  </div>
                </GameRow>
              ))}
            </ul>
          </Panel>
          <BattleCompendium me={me} />
        </div>
      </div>
    </CommandShell>
  );
}
