import { expect, it } from "vitest";
import postgres from "postgres";

const hasDatabase = !!process.env['PGHOST'] && !!process.env['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'];
it.skipIf(!hasDatabase)("campaign restart clears active operations but preserves battle status, honours and personal history", async () => {
  const session = JSON.parse(process.env['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'] ?? "{}");
  const sql = postgres({ max: 1 });
  try {
    await sql.begin(async (tx) => {
      for (const table of ['campaign', 'region_attacks', 'regions', 'games', 'ships', 'profiles', 'honours', 'battle_records']) {
        await tx.unsafe(`create temp table ${table} as select * from public.${table}`);
      }
      await tx`alter table pg_temp.games alter column id set default gen_random_uuid()`;
      await tx`alter table pg_temp.region_attacks alter column id set default gen_random_uuid()`;
      // Run the deployed body in a transaction-local function because the
      // sandbox SQL role cannot impersonate authenticated or execute its RPCs.
      const [definition] = await tx<{body: string}[]>`select pg_get_functiondef('public.admin_restart_campaign_safe()'::regprocedure) as body`;
      if (!definition) throw new Error('Missing reset function');
      await tx.unsafe(definition.body.replaceAll("auth.uid()", "current_setting('request.jwt.claim.sub')::uuid").replace('public.admin_restart_campaign_safe()', 'pg_temp.verify_campaign_reset()').replaceAll(/public\.(campaign|region_attacks|regions|games|ships)/g, 'pg_temp.$1'));
      const [region] = await tx<{id: number}[]>`select id from pg_temp.regions order by id limit 1`;
      if (!region) throw new Error('No region fixture');
      const [game] = await tx<{id: string}[]>`insert into pg_temp.games (creator_id, size, points, status, region_id) values (${session.user.id}, 'escaramuza', 1500, 'aceptada', ${region.id}) returning id`;
      if (!game) throw new Error('No game fixture');
      await tx`insert into pg_temp.region_attacks (region_id, attacker_id, kind, game_id, deadline) values (${region.id}, ${session.user.id}, 'attack', ${game.id}, now() + interval '7 days')`;
      const before = await tx`select id, imperial_credits, renown, forge_gift_claimed from pg_temp.profiles order by id`;
      const records = await tx`select * from pg_temp.battle_records order by user_id, game_id`;
      const honours = await tx`select * from pg_temp.honours order by id`;
      await tx`select set_config('request.jwt.claim.sub', ${session.user.id}, true)`;
      await tx`select pg_temp.verify_campaign_reset()`;
      const [active] = await tx<{count: number}[]>`select count(*)::int as count from pg_temp.region_attacks where resolved_at is null`;
      expect(active?.count).toBe(0);
      const [retained] = await tx<{status: string; region_id: number | null}[]>`select status, region_id from pg_temp.games where id = ${game.id}`;
      expect(retained?.status).toBe('aceptada');
      expect(retained?.region_id).toBeNull();
      expect(await tx`select id, imperial_credits, renown, forge_gift_claimed from pg_temp.profiles order by id`).toEqual(before);
      expect(await tx`select * from pg_temp.battle_records order by user_id, game_id`).toEqual(records);
      expect(await tx`select * from pg_temp.honours order by id`).toEqual(honours);
      const [owned] = await tx<{count: number}[]>`select count(*)::int as count from pg_temp.regions where owner_id is not null`;
      expect(owned?.count).toBe(0);
      throw new Error('ROLLBACK_VERIFIED_TEST');
    }).catch((error) => { if (error.message !== 'ROLLBACK_VERIFIED_TEST') throw error; });
  } finally { await sql.end(); }
});