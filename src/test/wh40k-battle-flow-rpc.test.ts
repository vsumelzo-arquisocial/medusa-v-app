// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const creator = '00000000-0000-4000-8000-000000000001', opponent = '00000000-0000-4000-8000-000000000002';
const listA = '00000000-0000-4000-8000-000000000011', listB = '00000000-0000-4000-8000-000000000012';
const squadA = '00000000-0000-4000-8000-000000000021';

function definitions(names: string[]) {
  const sql = ['0013_wh40k_battle_flow.sql', '0025_planet_battle_mutual_start_no_delete.sql'].map((file) => readFileSync(new URL(`../../drizzle/migrations/${file}`, import.meta.url), 'utf8')).join('\n');
  let out = '';
  for (const stmt of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)[\s\S]*?\$\$;/g)) if (names.includes(stmt[1] ?? '')) out += stmt[0] + '\n';
  return out;
}
const as = (uid: string) => db.query("SELECT set_config('test.uid',$1,false)", [uid]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY, imperial_credits integer DEFAULT 0, renown integer DEFAULT 0, approved boolean DEFAULT true);
CREATE TABLE army_lists(id uuid PRIMARY KEY, user_id uuid, name text, points integer, game_system text, list_format text, army_faction text, roster jsonb);
CREATE TABLE games(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid, opponent_id uuid, creator_list_id uuid, opponent_list_id uuid,
  creator_ally_id uuid, opponent_ally_id uuid, creator_ally_list_id uuid, opponent_ally_list_id uuid,
  status text DEFAULT 'abierta', size text DEFAULT 'batalla', points integer, notes text DEFAULT '', battle jsonb DEFAULT '{}',
  battle_type text DEFAULT 'normal', region_id integer, scenario_random boolean DEFAULT false, scheduled_at timestamptz,
  started_at timestamptz, accepted_at timestamptz);
CREATE TABLE game_exclusions(game_id uuid, user_id uuid);
CREATE TABLE wh40k_squads(id uuid PRIMARY KEY, user_id uuid, faction text, unit_name text, models integer, models_alive integer,
  wounds_max integer, wounds_left integer, points integer DEFAULT 0, nickname text DEFAULT '', status text DEFAULT 'ready', fallen_at timestamptz);
CREATE TABLE wh40k_squad_history(squad_id uuid, user_id uuid, kind text, game_id uuid, models_lost integer DEFAULT 0, wounds_lost integer DEFAULT 0, cost integer DEFAULT 0, note text DEFAULT '');
CREATE TABLE campaign(id integer PRIMARY KEY, phase text DEFAULT 'conquista', reward_neutral integer DEFAULT 10, reward_capture integer DEFAULT 50, reward_win integer DEFAULT 100, reward_loss integer DEFAULT 20);
CREATE TABLE battle_records(game_id uuid, user_id uuid, result text, vp_for integer, vp_against integer, points integer, models_lost integer, engines_destroyed integer, conquest boolean, mvp text);
CREATE TABLE region_attacks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), region_id integer, attacker_id uuid, defender_id uuid, kind text, game_id uuid, deadline timestamptz, resolved_at timestamptz, result text);
CREATE TABLE regions(id integer PRIMARY KEY, owner_id uuid, is_spaceport boolean DEFAULT false, owned_since timestamptz);
CREATE FUNCTION has_role(uuid, text) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.admin',true)='1'$$;
CREATE FUNCTION game_full(public.games) RETURNS boolean LANGUAGE sql AS $$SELECT $1.opponent_id IS NOT NULL$$;
CREATE FUNCTION is_excluded(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM game_exclusions WHERE game_id=$1 AND user_id=$2)$$;
CREATE FUNCTION list_40k_playable(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION give_region(integer, uuid, integer) RETURNS void LANGUAGE sql AS $$UPDATE regions SET owner_id=$2, owned_since=now() WHERE id=$1$$;
INSERT INTO campaign(id) VALUES(1);
`);
  await db.exec(definitions(['wh40k_sanitize_battle', 'wh40k_create_game', 'wh40k_set_game_list', 'respond_game', 'wh40k_battle_ready',
    'wh40k_save_battle', 'wh40k_apply_result', 'wh40k_confirm_end', 'wh40k_battle_tick', 'wh40k_dispute', 'admin_resolve_battle', 'wh40k_game_state', 'delete_game']));
  await db.query('INSERT INTO profiles(id) VALUES($1),($2)', [creator, opponent]);
  await db.query(`INSERT INTO army_lists VALUES
    ($1,$2,'Lista A',1900,'40k','normal','tau-empire','{"units":[{"name":"Fire Warriors","models":10}]}'),
    ($3,$4,'Lista B',1800,'40k','normal','space-marines','{"units":[{"name":"Intercessors","models":5}]}'),
    (gen_random_uuid(),$2,'Patrulla',500,'40k','patrulla','tau-empire','{"units":[]}')`, [listA, creator, listB, opponent]);
  await db.query(`INSERT INTO wh40k_squads VALUES ($1,$2,'tau-empire','Fire Warriors',10,10,NULL,NULL,100,'','ready',NULL)`, [squadA, creator]);
}, 30000);
afterAll(async () => { await db?.close(); });

async function newGame(kind = 'normal') {
  await as(creator);
  const { rows } = await db.query<{ id: string }>('SELECT wh40k_create_game($1,2000,$2,$3,$4,NULL,NULL) id', [kind, opponent, listA, '']);
  await as(opponent);
  await db.query('SELECT respond_game($1,true,$2)', [rows[0]!.id, listB]);
  return rows[0]!.id;
}

describe('flujo de batalla 40k', () => {
  for (const first of [creator, opponent]) {
    it(`el ataque abierto empieza solo con ambos listos, primero ${first === creator ? 'atacante' : 'defensor'}`, async () => {
      await as(creator);
      const { rows } = await db.query<{ id: string }>("INSERT INTO games(creator_id,opponent_id,creator_list_id,opponent_list_id,region_id,points,battle_type,status) VALUES($1,$2,$3,$4,42,2000,'normal','abierta') RETURNING id", [creator, opponent, listA, listB]);
      const id = rows[0]?.id;
      if (!id) throw new Error('missing attack');
      await as(first);
      await db.query('SELECT wh40k_battle_ready($1)', [id]);
      const waiting = (await db.query<{ status: string; ready: Record<string, boolean> }>("SELECT status,battle->'ready' ready FROM games WHERE id=$1", [id])).rows[0];
      expect(waiting?.status).toBe('abierta');
      expect(waiting?.ready[first === creator ? 'creator' : 'opponent']).toBe(true);
      await as(first === creator ? opponent : creator);
      await db.query('SELECT wh40k_battle_ready($1)', [id]);
      expect((await db.query<{ status: string }>('SELECT status FROM games WHERE id=$1', [id])).rows[0]?.status).toBe('en_curso');
    });
  }
  it('el atacante puede confirmar antes de que el defensor elija lista, sin revelar la lista rival', async () => {
    await as(creator);
    const { rows } = await db.query<{ id: string }>("INSERT INTO games(creator_id,opponent_id,creator_list_id,region_id,points,battle_type,status) VALUES($1,$2,$3,42,2000,'normal','abierta') RETURNING id", [creator, opponent, listA]);
    const id = rows[0]?.id;
    if (!id) throw new Error('missing attack');
    await db.query('SELECT wh40k_battle_ready($1)', [id]);
    await as(opponent);
    await expect(db.query('SELECT wh40k_battle_ready($1)', [id])).rejects.toThrow('own list required');
    const state = (await db.query<{ s: { lists: { side: string; roster: unknown }[] } }>('SELECT wh40k_game_state($1) s', [id])).rows[0]?.s;
    expect(state?.lists.find((l) => l.side === 'creator')?.roster).toBeNull();
    await db.query('SELECT wh40k_set_game_list($1,$2)', [id, listB]);
    await db.query('SELECT wh40k_battle_ready($1)', [id]);
    expect((await db.query<{ status: string }>('SELECT status FROM games WHERE id=$1', [id])).rows[0]?.status).toBe('en_curso');
  });
  it('ningún participante ni administrador puede borrar una partida', async () => {
    const id = await newGame();
    for (const uid of [creator, opponent]) {
      await as(uid);
      await expect(db.query('SELECT delete_game($1)', [id])).rejects.toThrow('cannot be deleted');
    }
    await db.query("SELECT set_config('test.admin','1',false)");
    await expect(db.query('SELECT delete_game($1)', [id])).rejects.toThrow('cannot be deleted');
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM games WHERE id=$1', [id])).rows[0]?.n).toBe(1);
  });
  it('la lista es obligatoria y debe ser del tipo de la partida', async () => {
    await as(creator);
    await expect(db.query('SELECT wh40k_create_game($1,2000,NULL,NULL,$2,NULL,NULL)', ['normal', ''])).rejects.toThrow();
    const { rows: patrullaLists } = await db.query<{ id: string }>("SELECT id FROM army_lists WHERE list_format='patrulla'");
    await expect(db.query('SELECT wh40k_create_game($1,2000,NULL,$2,$3,NULL,NULL)', ['patrulla', listA, ''])).rejects.toThrow('kind');
    const { rows } = await db.query<{ id: string }>('SELECT wh40k_create_game($1,1000,NULL,$2,$3,NULL,NULL) id', ['patrulla', patrullaLists[0]!.id, '']);
    expect(rows[0]?.id).toBeTruthy();
  });

  it('la lista rival queda oculta hasta que ambos inician y puede cambiarse antes', async () => {
    const g = await newGame();
    await as(creator);
    let st = (await db.query<{ s: { lists: { side: string; roster: unknown }[] } }>('SELECT wh40k_game_state($1) s', [g])).rows[0]!.s;
    expect(st.lists.find((l) => l.side === 'opponent')?.roster).toBeNull();
    expect(st.lists.find((l) => l.side === 'creator')?.roster).toBeTruthy();
    await db.query('SELECT wh40k_set_game_list($1,$2)', [g, listA]);
    await db.query('SELECT wh40k_battle_ready($1)', [g]);
    expect((await db.query<{ status: string }>('SELECT status FROM games WHERE id=$1', [g])).rows[0]?.status).toBe('aceptada');
    await as(opponent);
    await db.query('SELECT wh40k_battle_ready($1)', [g]);
    expect((await db.query<{ status: string }>('SELECT status FROM games WHERE id=$1', [g])).rows[0]?.status).toBe('en_curso');
    st = (await db.query<{ s: { lists: { side: string; roster: unknown }[] } }>('SELECT wh40k_game_state($1) s', [g])).rows[0]!.s;
    expect(st.lists.every((l) => l.roster)).toBe(true);
    await expect(db.query('SELECT wh40k_set_game_list($1,$2)', [g, listB])).rejects.toThrow('started');
  });

  it('con ambas confirmaciones se aplican bajas, recompensas e historial', async () => {
    const g = await newGame();
    for (const u of [creator, opponent]) { await as(u); await db.query('SELECT wh40k_battle_ready($1)', [g]); }
    await as(creator);
    await db.query(`SELECT wh40k_save_battle($1, $2::jsonb)`, [g, JSON.stringify({ vp: { creator: 50, opponent: 30 }, losses: { [squadA]: { models: 10, wounds: 0 } } })]);
    await db.query('SELECT wh40k_confirm_end($1)', [g]);
    expect((await db.query<{ status: string }>('SELECT status FROM games WHERE id=$1', [g])).rows[0]?.status).toBe('en_curso');
    await as(opponent);
    await db.query('SELECT wh40k_confirm_end($1)', [g]);
    const game = (await db.query<{ status: string; winner: string }>("SELECT status, battle->'result'->>'winner' winner FROM games WHERE id=$1", [g])).rows[0]!;
    expect(game).toEqual({ status: 'finalizada', winner: 'creator' });
    const squad = (await db.query<{ models_alive: number; status: string; fallen: boolean }>('SELECT models_alive, status, fallen_at IS NOT NULL fallen FROM wh40k_squads WHERE id=$1', [squadA])).rows[0]!;
    expect(squad).toEqual({ models_alive: 0, status: 'fallen', fallen: true });
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM wh40k_squad_history WHERE squad_id=$1 AND kind='fallen'", [squadA])).rows[0]?.n).toBe(1);
    expect((await db.query<{ renown: number; credits: number }>('SELECT renown, imperial_credits credits FROM profiles WHERE id=$1', [creator])).rows[0]).toEqual({ renown: 10, credits: 100 });
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM battle_records WHERE game_id=$1', [g])).rows[0]?.n).toBe(2);
  });

  it('una sola confirmación se aplica sola tras 24 horas', async () => {
    const g = await newGame();
    for (const u of [creator, opponent]) { await as(u); await db.query('SELECT wh40k_battle_ready($1)', [g]); }
    await db.query('SELECT wh40k_confirm_end($1)', [g]);
    await db.query("UPDATE games SET battle = jsonb_set(battle,'{confirm_deadline}', to_jsonb(now() - interval '1 second')) WHERE id=$1", [g]);
    await db.query('SELECT wh40k_battle_tick($1)', [g]);
    expect((await db.query<{ status: string }>('SELECT status FROM games WHERE id=$1', [g])).rows[0]?.status).toBe('finalizada');
  });

  it('la impugnación congela y el admin aplica con los puntos corregidos', async () => {
    const g = await newGame();
    for (const u of [creator, opponent]) { await as(u); await db.query('SELECT wh40k_battle_ready($1)', [g]); }
    await as(creator);
    await db.query('SELECT wh40k_save_battle($1, $2::jsonb)', [g, JSON.stringify({ vp: { creator: 50, opponent: 30 } })]);
    await db.query('SELECT wh40k_confirm_end($1)', [g]);
    await db.query('SELECT wh40k_dispute($1,$2)', [g, 'PV mal anotados']);
    await expect(db.query('SELECT wh40k_save_battle($1,$2::jsonb)', [g, '{}'])).rejects.toThrow('disputed');
    await expect(db.query('SELECT wh40k_confirm_end($1)', [g])).rejects.toThrow('disputed');
    await db.query("SELECT set_config('test.admin','1',false)");
    await db.query(`SELECT admin_resolve_battle($1,'aplicar','{"vp":{"creator":10,"opponent":40}}'::jsonb)`, [g]);
    const game = (await db.query<{ status: string; winner: string }>("SELECT status, battle->'result'->>'winner' winner FROM games WHERE id=$1", [g])).rows[0]!;
    expect(game).toEqual({ status: 'finalizada', winner: 'opponent' });
  });

  it('el admin puede eliminar un resultado impugnado sin aplicar bajas', async () => {
    const g = await newGame();
    for (const u of [creator, opponent]) { await as(u); await db.query('SELECT wh40k_battle_ready($1)', [g]); }
    await db.query('SELECT wh40k_confirm_end($1)', [g]);
    await db.query('SELECT wh40k_dispute($1,$2)', [g, 'no se jugó']);
    await db.query("SELECT set_config('test.admin','1',false)");
    await db.query(`SELECT admin_resolve_battle($1,'eliminar')`, [g]);
    expect((await db.query<{ status: string }>('SELECT status FROM games WHERE id=$1', [g])).rows[0]?.status).toBe('cancelada');
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM battle_records WHERE game_id=$1', [g])).rows[0]?.n).toBe(0);
  });
});
