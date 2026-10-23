import { expect, it } from "vitest";
import postgres from "postgres";

it.skipIf(!process.env['PGHOST'])("dismissal hides only removed veterans and retains combat deaths", async () => {
  const sql = postgres({ max: 1 });
  try {
    await sql.begin(async (tx) => {
      for (const table of ['collection_items', 'veterans', 'unit_catalog']) {
        await tx.unsafe(`create temp table ${table} as select * from public.${table} where false`);
      }
      await tx`insert into pg_temp.unit_catalog select * from public.unit_catalog`;
      await tx`alter table pg_temp.veterans alter column id set default gen_random_uuid()`;
      await tx`alter table pg_temp.veterans alter column renown set default 0`;
      for (const name of ['veteran_kind(integer)', 'dismiss_unit(integer,integer)', 'sync_veterans(uuid)', 'dismiss_unit_and_veterans(integer,integer)']) {
        const [definition] = await tx<{body: string}[]>`select pg_get_functiondef(${`public.${name}`}::regprocedure) as body`;
        if (!definition) throw new Error('Missing dismissal function');
        await tx.unsafe(definition.body.replaceAll("auth.uid()", "current_setting('request.jwt.claim.sub')::uuid").replaceAll('public.veteran_kind', 'pg_temp.veteran_kind').replaceAll('public.dismiss_unit(', 'pg_temp.dismiss_unit(').replaceAll(/public\.(collection_items|veterans|unit_catalog)/g, 'pg_temp.$1').replaceAll('public.sync_veterans', 'pg_temp.sync_veterans').replaceAll('public.dismiss_unit_and_veterans', 'pg_temp.dismiss_unit_and_veterans'));
      }
      const [unit] = await tx<{unit_id: number}[]>`select unit_id from public.unit_catalog where category = 'titan' limit 1`;
      if (!unit) throw new Error('No titan fixture');
      const uid = crypto.randomUUID();
      await tx`insert into pg_temp.collection_items (user_id, unit_id, quantity) values (${uid}, ${unit.unit_id}, 2)`;
      await tx`insert into pg_temp.veterans (user_id, unit_id, kind, name, status) values (${uid}, ${unit.unit_id}, 'titan', 'Survivor', 'activo'), (${uid}, ${unit.unit_id}, 'titan', 'Removed', 'activo'), (${uid}, ${unit.unit_id}, 'titan', 'Combat death', 'caido')`;
      await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
      await tx`select pg_temp.dismiss_unit_and_veterans(${unit.unit_id}, 1)`;
      const [partial] = await tx<{count: number}[]>`select count(*)::int as count from pg_temp.veterans where user_id = ${uid} and status = 'activo'`;
      expect(partial?.count).toBe(1);
      await tx`select pg_temp.dismiss_unit_and_veterans(${unit.unit_id}, 1)`;
      const visible = await tx<{name: string; status: string}[]>`select name, status from pg_temp.veterans where user_id = ${uid} and status in ('activo', 'caido', 'recuperando')`;
      expect(visible).toEqual([{ name: 'Combat death', status: 'caido' }]);
      throw new Error('ROLLBACK_VERIFIED_TEST');
    }).catch((error) => { if (error.message !== 'ROLLBACK_VERIFIED_TEST') throw error; });
  } finally { await sql.end(); }
});