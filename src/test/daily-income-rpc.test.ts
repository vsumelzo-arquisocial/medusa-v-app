import { expect, it } from "vitest";
import postgres from "postgres";

it.skipIf(!process.env["PGHOST"])("income is manual, grants one day only, and rejects a second collection", async () => {
  const sql = postgres({ max: 1 });
  try {
    await sql.begin(async (tx) => {
      for (const table of ["ships", "profiles", "regions"]) {
        await tx.unsafe(`create temp table ${table} as select * from public.${table} where false`);
      }
      await tx`create function pg_temp.ship_tick() returns void language sql as 'select null::void'`;
      await tx`create function pg_temp.mod_level(uuid,text) returns integer language sql as 'select 1'`;
      const [definition] = await tx<{ body: string }[]>`select pg_get_functiondef('public.collect_daily_income()'::regprocedure) as body`;
      if (!definition) throw new Error("Missing collection function");
      await tx.unsafe(definition.body.replaceAll("auth.uid()", "current_setting('request.jwt.claim.sub')::uuid").replaceAll(/public\.(collect_daily_income|ships|profiles|regions|ship_tick|mod_level)/g, "pg_temp.$1"));
      const uid = crypto.randomUUID();
      await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
      await tx`insert into pg_temp.profiles(id, imperial_credits) values (${uid}, 2200)`;
      await tx`insert into pg_temp.ships(user_id,last_income_at) values (${uid}, now() - interval '3 days')`;
      const [before] = await tx<{ imperial_credits: number }[]>`select imperial_credits from pg_temp.profiles where id=${uid}`;
      expect(before?.imperial_credits).toBe(2200);
      const [result] = await tx<{ amount: number }[]>`select pg_temp.collect_daily_income() as amount`;
      expect(result?.amount).toBe(150);
      const [after] = await tx<{ imperial_credits: number }[]>`select imperial_credits from pg_temp.profiles where id=${uid}`;
      expect(after?.imperial_credits).toBe(2350);
      await tx`do $$ begin
        begin perform pg_temp.collect_daily_income(); raise exception 'unexpected second collection';
        exception when others then if sqlerrm <> 'Debes esperar 24 horas entre recogidas' then raise; end if; end;
      end $$`;
      const [cooldown] = await tx<{ seconds: number }[]>`select extract(epoch from (last_income_at + interval '24 hours' - now()))::integer as seconds from pg_temp.ships where user_id=${uid}`;
      expect(cooldown?.seconds).toBe(86400);
      throw new Error("ROLLBACK_VERIFIED_TEST");
    }).catch((error) => { if (error.message !== "ROLLBACK_VERIFIED_TEST") throw error; });
  } finally { await sql.end(); }
});