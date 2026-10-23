// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const uid = '00000000-0000-4000-8000-000000000001';
let db: PGlite;
const extract = (file: string, name: string) => {
  const sql = readFileSync(new URL(`../../drizzle/migrations/${file}`, import.meta.url), 'utf8');
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?END \\$\\$;`, 'i'));
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${uid}'::uuid $$;
  CREATE TABLE profiles(id uuid PRIMARY KEY, imperial_credits integer, army_faction text);
  CREATE TABLE ships(user_id uuid PRIMARY KEY, hull_hp integer);
  CREATE TABLE ship_modules(user_id uuid, module text, level integer, damaged boolean DEFAULT false);
  CREATE TABLE module_types(id text PRIMARY KEY, active boolean, base_cost integer, base_hours integer, max_level integer);
  CREATE TABLE build_queue(id uuid DEFAULT gen_random_uuid(), user_id uuid, module text, target_level integer, cost integer, kind text DEFAULT 'build', duration_seconds integer, repair_amount integer);
  CREATE FUNCTION mod_level(uuid,text) RETURNS integer LANGUAGE sql AS $$ SELECT coalesce((SELECT level FROM ship_modules WHERE user_id=$1 AND module=$2 AND NOT damaged),0) $$;
  CREATE FUNCTION region_rate(uuid,text) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.bonus',true),''),'0')::numeric $$;
  CREATE FUNCTION ship_assert_job_slot() RETURNS void LANGUAGE sql AS $$ SELECT null::void $$;
  CREATE FUNCTION ship_start_queued(uuid) RETURNS void LANGUAGE sql AS $$ SELECT null::void $$;
  CREATE FUNCTION ship_max_hull(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 30 $$;
  INSERT INTO profiles VALUES('${uid}',10000,'tau-empire');
  INSERT INTO ships VALUES('${uid}',20);
  INSERT INTO ship_modules VALUES('${uid}','puente',3,false),('${uid}','bodegas',1,false),('${uid}','baterias',1,true);
  INSERT INTO module_types VALUES('puente',true,150,1,5),('bodegas',true,100,1,3),('baterias',true,150,1,3);`);
  const racial = readFileSync(new URL('../../drizzle/migrations/0017_racial_hold_and_recruit_cancel.sql', import.meta.url), 'utf8');
  await db.exec(racial.split('CREATE OR REPLACE FUNCTION public.ship_capacity')[0] ?? '');
  await db.exec(readFileSync(new URL('../../drizzle/migrations/0026_ship_upgrade_prices_and_initial_capacity.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../drizzle/migrations/0027_progressive_ship_upgrade_cost.sql', import.meta.url), 'utf8'));
  await db.exec(extract('0016_region_bonuses_40k.sql', 'repair_module'));
  await db.exec(extract('0016_region_bonuses_40k.sql', 'repair_hull'));
}, 30000);
afterAll(async () => { await db.close(); });
describe('authoritative ship economy', () => {
  it('initial level-one standard ship has 200 OC', async () => {
    expect((await db.query<{n:number}>(`SELECT ship_capacity('${uid}') n`)).rows[0]?.n).toBe(200);
  });
  it('keeps numerous factions at 300 and elite factions at 150 OC', async () => {
    for (const [faction, capacity] of [['orks',300],['tyranids',300],['adeptus-custodes',150],['tau-empire',200]] as const) {
      await db.query('UPDATE profiles SET army_faction=$1', [faction]);
      expect((await db.query<{n:number}>(`SELECT ship_capacity('${uid}') n`)).rows[0]?.n).toBe(capacity);
    }
  });
  it('each further standard hold level adds 100 OC', async () => {
    await db.exec("UPDATE ship_modules SET level=2 WHERE module='bodegas'");
    expect((await db.query<{n:number}>(`SELECT ship_capacity('${uid}') n`)).rows[0]?.n).toBe(300);
  });
  it('charges a tenfold base with 25 percent increase for bridge level two', async () => {
    await db.exec("UPDATE ship_modules SET level=1 WHERE module='puente'; SELECT build_module('puente')");
    expect((await db.query<{cost:number}>("SELECT cost FROM build_queue WHERE module='puente'")).rows[0]?.cost).toBe(1875);
    expect((await db.query<{n:number}>('SELECT imperial_credits n FROM profiles')).rows[0]?.n).toBe(8125);
  });
  it('uses queued levels for progressive prices and retains paid jobs', async () => {
    await db.exec("SELECT build_module('puente')");
    expect((await db.query<{target_level:number;cost:number}>("SELECT target_level,cost FROM build_queue WHERE module='puente' ORDER BY target_level")).rows).toEqual([{target_level:2,cost:1875},{target_level:3,cost:2344}]);
  });
  it('leaves repairs at 75 credits for module and 50 for ten hull points', async () => {
    await db.exec("SELECT repair_module('baterias'); SELECT repair_hull()");
    const rows = (await db.query<{kind:string;cost:number}>("SELECT kind,cost FROM build_queue WHERE kind<>'build' ORDER BY kind")).rows;
    expect(rows).toEqual([{kind:'hull_repair',cost:50},{kind:'module_repair',cost:75}]);
  });
});