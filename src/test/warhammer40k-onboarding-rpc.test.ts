// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../drizzle/migrations/0000_warhammer40k_army_identity.sql', import.meta.url), 'utf8');
let database: PGlite;
beforeEach(async () => {
  database = new PGlite();
  await database.exec(`CREATE ROLE authenticated; CREATE TABLE public.profiles(id integer PRIMARY KEY, approved boolean, oath_sworn_at timestamptz, allegiance text, faction text, legion text); GRANT SELECT,UPDATE ON public.profiles TO authenticated;`);
  await database.exec(migration);
  await database.exec(`INSERT INTO public.profiles VALUES (1,true,now(),'loyalist','astartes','ultramarines',null,null,null); SET ROLE authenticated;`);
});
afterEach(async () => { await database.close(); });
describe('persisted 40k army identity', () => {
  it('lets existing commanders select a 40k army without replacing legacy identity', async () => {
    await database.exec(`UPDATE public.profiles SET army_race='humanity',army_faction='space-marines',army_variant='blood-angels' WHERE id=1;`);
    expect((await database.query('SELECT army_race,army_faction,army_variant,allegiance,faction,legion FROM public.profiles')).rows).toEqual([{ army_race: 'humanity', army_faction: 'space-marines', army_variant: 'blood-angels', allegiance: 'loyalist', faction: 'astartes', legion: 'ultramarines' }]);
  });
  it('rejects forged race and chapter combinations', async () => {
    await expect(database.exec(`UPDATE public.profiles SET army_race='orks',army_faction='space-marines' WHERE id=1;`)).rejects.toThrow('Invalid race/faction');
    await expect(database.exec(`UPDATE public.profiles SET army_race='tau',army_faction='tau-empire',army_variant='blood-angels' WHERE id=1;`)).rejects.toThrow('Invalid faction variant');
  });
  it('locks a confirmed army against direct changes', async () => {
    await database.exec(`UPDATE public.profiles SET army_race='orks',army_faction='orks' WHERE id=1;`);
    await expect(database.exec(`UPDATE public.profiles SET army_race='necrons',army_faction='necrons' WHERE id=1;`)).rejects.toThrow('already confirmed');
  });
  it('clears 40k selection when an authorized profile reset clears the oath', async () => {
    await database.exec(`UPDATE public.profiles SET army_race='orks',army_faction='orks' WHERE id=1; RESET ROLE; UPDATE public.profiles SET oath_sworn_at=null WHERE id=1;`);
    expect((await database.query('SELECT army_race,army_faction,army_variant FROM public.profiles')).rows).toEqual([{ army_race: null, army_faction: null, army_variant: null }]);
  });
});