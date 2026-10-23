// @vitest-environment node
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { expect, it } from 'vitest';

const migration = readFileSync(new URL('../../drizzle/migrations/0018_complete_personal_profile_reset.sql', import.meta.url), 'utf8');
const uid = '00000000-0000-4000-8000-000000000001';
const rival = '00000000-0000-4000-8000-000000000002';
const tables = ['profiles','user_roles','admin_bootstrap_state','region_attacks','games','regions','naval_raids','naval_private_plans','naval_stances','game_exclusions','battle_records','wh40k_squad_history','wh40k_squads','wh40k_recruits','honours','engine_damage','lost_engines','veteran_battles','veterans','recruit_orders','build_queue','pod_bay','ship_supports','ship_modules','ships','army_lists','collection_items'];

it.skipIf(!process.env['PGHOST'])('reset clears all personal progress, training and jobs while preserving account and rival records', async () => {
 const sql = postgres({max:1});
 try {
  await sql.begin(async tx => {
   for (const table of tables) await tx.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
   const [definition] = await tx<{body:string}[]>`SELECT pg_get_functiondef('public.reset_profile()'::regprocedure) AS body`;
   expect(definition?.body).toContain('pg_advisory_xact_lock(72401020)');
   const body = migration.match(/CREATE OR REPLACE FUNCTION public\.reset_profile\(\)[\s\S]*?END \$function\$;/)?.[0];
   if (!body) throw new Error('Reset function missing');
   await tx.unsafe(body.replace('public.reset_profile()', 'pg_temp.verify_reset()').replace('auth.uid()', "nullif(current_setting('test.uid',true),'')::uuid").replaceAll(/public\.([a-z0-9_]+)/g, 'pg_temp.$1'));
   await tx`INSERT INTO pg_temp.profiles(id,approved,email,army_race,army_faction,leader_name,imperial_credits,renown,oath_sworn_at) VALUES (${uid},true,'test@example.test','tau','tau-empire','Old army',9000,80,now()),(${rival},true,'rival@example.test','orks','orks','Rival',5000,10,now())`;
   await tx`INSERT INTO pg_temp.user_roles(user_id,role) VALUES(${uid},'admin')`;
   await tx`INSERT INTO pg_temp.admin_bootstrap_state(id,claimed) VALUES(1,true)`;
   for (const player of [uid,rival]) {
    for (const status of ['ready','training','retraining','restoring','fallen']) {
     const [squad] = await tx<{id:string}[]>`INSERT INTO pg_temp.wh40k_squads(user_id,faction,unit_name,models,models_alive,points,status,ready_at) VALUES(${player},'tau-empire','Test squad',10,10,100,${status},now()+interval '1 day') RETURNING id`;
     if (!squad) throw new Error('Missing squad');
     await tx`INSERT INTO pg_temp.wh40k_squad_history(squad_id,user_id,kind,cost) VALUES(${squad.id},${player},'recruited',100)`;
    }
    await tx`INSERT INTO pg_temp.wh40k_recruits(user_id,faction,unit_name,models,quantity) VALUES(${player},'tau-empire','Test squad',10,1)`;
    await tx`INSERT INTO pg_temp.ships(user_id,name) VALUES(${player},'Test ship')`;
    await tx`INSERT INTO pg_temp.build_queue(user_id,module,target_level,cost,kind,sequence,started_at,finishes_at) VALUES(${player},'casco',1,100,'build',1,now(),now()+interval '1 day')`;
    await tx`INSERT INTO pg_temp.army_lists(user_id,name,points,mode,gamemode) VALUES(${player},'Test list',2000,'coleccion','normal')`;
   }
   await tx`INSERT INTO pg_temp.regions(id,name,type,neighbors,owner_id,is_spaceport) VALUES(1,'Test region','mina','{}',${uid},true),(2,'Rival region','mina','{}',${rival},true)`;
   const [finished] = await tx<{id:string}[]>`INSERT INTO pg_temp.games(creator_id,opponent_id,size,points,status) VALUES(${uid},${rival},'normal',2000,'finalizada') RETURNING id`;
   if (!finished) throw new Error('Missing finished game');
   await tx`INSERT INTO pg_temp.battle_records(game_id,user_id,result,vp_for,vp_against,points) VALUES(${finished.id},${uid},'win',50,30,2000),(${finished.id},${rival},'loss',30,50,2000)`;
   await tx`INSERT INTO pg_temp.games(creator_id,opponent_id,size,points,status,region_id) VALUES(${rival},${uid},'normal',2000,'aceptada',1)`;
   const rivalBefore = await tx`SELECT * FROM pg_temp.profiles WHERE id=${rival}`;
   await tx`SELECT set_config('test.uid',${uid},true)`;
   await tx`SELECT pg_temp.verify_reset()`;
   for (const table of ['wh40k_squads','wh40k_squad_history','wh40k_recruits','ships','build_queue','army_lists','battle_records']) {
    const [count] = await tx.unsafe(`SELECT count(*)::int n FROM pg_temp.${table} WHERE user_id=$1`,[uid]);
    expect(count?.['n'],table).toBe(0);
    const [remaining] = await tx.unsafe(`SELECT count(*)::int n FROM pg_temp.${table} WHERE user_id=$1`,[rival]);
    expect(remaining?.['n'],`rival ${table}`).toBeGreaterThan(0);
   }
   expect(await tx`SELECT * FROM pg_temp.profiles WHERE id=${rival}`).toEqual(rivalBefore);
   const [profile] = await tx`SELECT imperial_credits,renown,army_race,army_faction,oath_sworn_at,leader_name,approved,email FROM pg_temp.profiles WHERE id=${uid}`;
   expect(profile).toEqual({imperial_credits:2200,renown:0,army_race:null,army_faction:null,oath_sworn_at:null,leader_name:null,approved:true,email:'test@example.test'});
   expect((await tx`SELECT role FROM pg_temp.user_roles WHERE user_id=${uid}`)[0]?.['role']).toBe('admin');
   expect((await tx`SELECT claimed FROM pg_temp.admin_bootstrap_state`)[0]?.['claimed']).toBe(true);
   expect((await tx`SELECT owner_id,is_spaceport FROM pg_temp.regions WHERE id=1`)[0]).toEqual({owner_id:null,is_spaceport:false});
   expect((await tx`SELECT status FROM pg_temp.games WHERE id=${finished.id}`)[0]?.['status']).toBe('finalizada');
   expect((await tx`SELECT status,region_id FROM pg_temp.games WHERE status<>'finalizada'`)[0]).toEqual({status:'cancelada',region_id:null});
   await tx`SELECT pg_temp.verify_reset()`;
   expect((await tx`SELECT imperial_credits FROM pg_temp.profiles WHERE id=${uid}`)[0]?.['imperial_credits']).toBe(2200);
   await tx`SELECT set_config('test.uid','',true)`;
   await expect(tx.savepoint(async sp => { await sp`SELECT pg_temp.verify_reset()`; })).rejects.toThrow('No autenticado');
   throw new Error('ROLLBACK_VERIFIED_TEST');
  }).catch(error => { if(error.message !== 'ROLLBACK_VERIFIED_TEST') throw error; });
 } finally { await sql.end(); }
},30000);