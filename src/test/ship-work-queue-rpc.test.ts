// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
let db: PGlite;
const uid='00000000-0000-4000-8000-000000000001';
const sql=readFileSync(new URL('../../drizzle/migrations/0014_ship_serial_work_queue.sql',import.meta.url),'utf8');
beforeEach(async()=>{
 db=new PGlite();
 await db.exec(`CREATE SCHEMA auth;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,imperial_credits integer);
 CREATE TABLE ships(user_id uuid PRIMARY KEY,hull_hp integer,hull_repair_until timestamptz,hull_repair_target integer);
 CREATE TABLE ship_modules(user_id uuid,module text,level integer,damaged boolean DEFAULT false,damaged_until timestamptz,building_until timestamptz,PRIMARY KEY(user_id,module));
 CREATE TABLE module_types(id text PRIMARY KEY,active boolean DEFAULT true,base_cost integer,base_hours integer,max_level integer);
 CREATE TABLE build_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,module text,target_level integer,cost integer,created_at timestamptz DEFAULT now());
 CREATE TABLE naval_raids(id uuid PRIMARY KEY,status text,deadline timestamptz);
 CREATE FUNCTION campaign_tick() RETURNS void LANGUAGE sql AS $$SELECT null::void$$;
 CREATE FUNCTION resolve_raid(uuid) RETURNS void LANGUAGE sql AS $$SELECT null::void$$;
 CREATE FUNCTION ship_busy(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.busy',true),'false')='true'$$;
 CREATE FUNCTION mod_level(uuid,text) RETURNS integer LANGUAGE sql AS $$SELECT coalesce((SELECT level FROM ship_modules WHERE user_id=$1 AND module=$2 AND NOT damaged),0)$$;
 CREATE FUNCTION ship_max_hull(uuid) RETURNS integer LANGUAGE sql AS $$SELECT 30+8*mod_level($1,'casco')$$;
 `);
 await db.query('INSERT INTO profiles VALUES($1,10000);',[uid]);
 await db.query('INSERT INTO ships VALUES($1,20,NULL,NULL)',[uid]);
 await db.query("INSERT INTO ship_modules(user_id,module,level,damaged) VALUES($1,'puente',3,false),($1,'forja',3,false),($1,'baterias',1,true)",[uid]);
 await db.exec("INSERT INTO module_types(id,base_cost,base_hours,max_level) VALUES('puente',100,1,5),('forja',100,1,3),('baterias',100,1,3),('casco',100,1,3),('bodegas',100,1,3),('motores_plasma',100,1,3),('lanza_proa',100,1,3);");
 await db.exec(sql);
 await db.query("SELECT set_config('test.uid',$1,false)",[uid]);
},30000);
afterEach(async()=>{await db.close();});
async function jobs(){return (await db.query<{id:string;kind:string;module:string;started_at:string|null;finishes_at:string|null}>('SELECT * FROM build_queue ORDER BY created_at,sequence')).rows;}
async function advance(seconds=1){await db.query("UPDATE build_queue SET finishes_at=now()-make_interval(secs=>$1) WHERE started_at IS NOT NULL",[seconds]);await db.exec('SELECT ship_tick()');}
describe('cola de cinco trabajos de nave',()=>{
 it('acepta cinco incluyendo el activo; rechaza un sexto sin cobrar',async()=>{
  await db.exec("SELECT repair_hull();SELECT repair_module('baterias');SELECT build_module('baterias');SELECT build_module('bodegas');SELECT build_module('casco');");
  expect(await jobs()).toHaveLength(5);const balance=(await db.query<{imperial_credits:number}>('SELECT imperial_credits FROM profiles')).rows[0]?.imperial_credits;
  await expect(db.exec("SELECT build_module('motores_plasma')")).rejects.toThrow('queue full');
  expect((await db.query<{imperial_credits:number}>('SELECT imperial_credits FROM profiles')).rows[0]?.imperial_credits).toBe(balance);
 });
 it('solo ejecuta uno aunque el astillero esté a nivel tres',async()=>{
  await db.exec("SELECT build_module('bodegas');SELECT repair_hull();SELECT repair_module('baterias');");
  expect((await jobs()).filter(x=>x.started_at)).toHaveLength(1);
  expect((await db.query<{n:number}>("SELECT count(*)::int n FROM ship_modules WHERE building_until IS NOT NULL OR damaged_until IS NOT NULL")).rows[0]?.n).toBe(1);
  expect((await db.query<{hull_repair_until:string|null}>('SELECT hull_repair_until FROM ships')).rows[0]?.hull_repair_until).toBeNull();
 });
 it('casco, reparación de módulo y mejora avanzan en orden FIFO',async()=>{
  await db.exec("SELECT repair_hull();SELECT repair_module('baterias');SELECT build_module('baterias');");
  expect((await jobs()).map(x=>x.kind)).toEqual(['hull_repair','module_repair','build']);
  await advance();expect((await jobs())[0]?.kind).toBe('module_repair');expect((await jobs()).filter(x=>x.started_at)).toHaveLength(1);
  expect((await db.query<{hull_hp:number}>('SELECT hull_hp FROM ships')).rows[0]?.hull_hp).toBe(30);
  await advance();expect((await jobs())[0]?.kind).toBe('build');
  expect((await db.query<{damaged:boolean}>("SELECT damaged FROM ship_modules WHERE module='baterias'")).rows[0]?.damaged).toBe(false);
  await advance();expect(await jobs()).toHaveLength(0);expect((await db.query<{level:number}>("SELECT level FROM ship_modules WHERE module='baterias'")).rows[0]?.level).toBe(2);
 });
 it('recupera el tiempo transcurrido sin ejecutar trabajos en paralelo',async()=>{
  await db.exec("SELECT repair_hull();SELECT repair_module('baterias');SELECT build_module('baterias');");
  await advance(86400);expect(await jobs()).toHaveLength(0);
  expect((await db.query<{level:number}>("SELECT level FROM ship_modules WHERE module='baterias'")).rows[0]?.level).toBe(2);
 });
 it('no permite duplicar la reparación pendiente de casco o módulo',async()=>{
  await db.exec("SELECT build_module('bodegas');SELECT repair_hull();SELECT repair_module('baterias');");
  await expect(db.exec('SELECT repair_hull()')).rejects.toThrow('busy module');await expect(db.exec("SELECT repair_module('baterias')")).rejects.toThrow('busy module');expect(await jobs()).toHaveLength(3);
 });
 it('cancelar espera devuelve créditos una sola vez y no cancela el activo',async()=>{
  await db.exec("SELECT repair_hull();SELECT build_module('bodegas');");const rows=await jobs();const id=rows[1]?.id;
  await expect(db.query('SELECT cancel_queued($1)',[rows[0]?.id])).rejects.toThrow('job active');
  await db.query('SELECT cancel_queued($1)',[id]);expect((await db.query<{imperial_credits:number}>('SELECT imperial_credits FROM profiles')).rows[0]?.imperial_credits).toBe(9950);
  await expect(db.query('SELECT cancel_queued($1)',[id])).rejects.toThrow('not found');
 });
 it('no deja cancelar una reparación con mejoras dependientes',async()=>{
  await db.exec("SELECT repair_hull();SELECT repair_module('baterias');SELECT build_module('baterias');");
  await expect(db.query('SELECT cancel_queued($1)',[(await jobs())[1]?.id])).rejects.toThrow('cancel later first');
 });
 it('una nave enfrentada no inicia ni añade trabajos',async()=>{
  await db.exec("SELECT repair_hull();SELECT build_module('bodegas');SELECT set_config('test.busy','true',false);");
  await expect(db.exec("SELECT build_module('casco')")).rejects.toThrow('ship busy');
  await advance();expect(await jobs()).toHaveLength(2);expect((await jobs())[1]?.started_at).toBeNull();
 });
 it('intentos simultáneos no exceden cinco trabajos',async()=>{
  await db.exec("SELECT repair_hull();SELECT repair_module('baterias');SELECT build_module('baterias');SELECT build_module('bodegas');");
  const attempts=await Promise.allSettled([db.exec("SELECT build_module('casco')"),db.exec("SELECT build_module('motores_plasma')")]);
  expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(await jobs()).toHaveLength(5);expect((await jobs()).filter(x=>x.started_at)).toHaveLength(1);
 });
});
