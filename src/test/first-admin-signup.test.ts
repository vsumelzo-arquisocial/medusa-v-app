// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./fixtures/first_signup_administrator.sql", import.meta.url), "utf8");
let db: PGlite | undefined;
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

async function setup(existing = false) {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, email text, approved boolean NOT NULL DEFAULT false);
    CREATE TABLE public.user_roles(user_id uuid, role text, UNIQUE(user_id, role));
  `);
  if (existing) await db.query("INSERT INTO public.profiles(id, email) VALUES ($1, 'existing@example.test')", [first]);
  await db.exec(migration);
  await db.exec("CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();");
  return db;
}
afterEach(async () => { await db?.close(); db = undefined; });

describe("first signup administrator database trigger", () => {
  it("approves the first account and grants admin; the second awaits approval", async () => {
    const database = await setup();
    await database.query("INSERT INTO auth.users(id,email) VALUES ($1,'first@example.test'),($2,'second@example.test')", [first, second]);
    const profiles = await database.query("SELECT id, approved FROM public.profiles ORDER BY id");
    expect(profiles.rows).toEqual([{ id: first, approved: true }, { id: second, approved: false }]);
    const roles = await database.query("SELECT user_id FROM public.user_roles WHERE role = 'admin'");
    expect(roles.rows).toEqual([{ user_id: first }]);
  });
  it("never reopens administrator bootstrap after all accounts are removed", async () => {
    const database = await setup();
    await database.query("INSERT INTO auth.users(id,email) VALUES ($1,'first@example.test')", [first]);
    await database.exec("DELETE FROM public.user_roles; DELETE FROM public.profiles; DELETE FROM auth.users;");
    await database.query("INSERT INTO auth.users(id,email) VALUES ($1,'second@example.test')", [second]);
    expect((await database.query("SELECT user_id FROM public.user_roles WHERE role = 'admin'")).rows).toEqual([]);
    expect((await database.query("SELECT approved FROM public.profiles")).rows).toEqual([{ approved: false }]);
  });
  it("does not promote new signups when migrating an existing installation", async () => {
    const database = await setup(true);
    await database.query("INSERT INTO auth.users(id,email) VALUES ($1,'second@example.test')", [second]);
    expect((await database.query("SELECT user_id FROM public.user_roles WHERE role = 'admin'")).rows).toEqual([]);
    expect((await database.query("SELECT approved FROM public.profiles WHERE id = $1", [second])).rows).toEqual([{ approved: false }]);
  });
  it("creates just one administrator for two simultaneous registration requests", async () => {
    const database = await setup();
    await Promise.all([
      database.query("INSERT INTO auth.users(id,email) VALUES ($1,'one@example.test')", [first]),
      database.query("INSERT INTO auth.users(id,email) VALUES ($1,'two@example.test')", [second]),
    ]);
    expect((await database.query("SELECT count(*)::integer AS count FROM public.user_roles WHERE role = 'admin'")).rows).toEqual([{ count: 1 }]);
  });
});