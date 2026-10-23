import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bootstrapAdministrator } from "../../scripts/admin-bootstrap";

function fixture(createFails = false) {
  const single = vi.fn().mockResolvedValue({ data: { id: "new-account", user_id: "new-account" }, error: null });
  const chain = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), single, upsert: vi.fn().mockResolvedValue({ error: null }) };
  chain.update.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.select.mockReturnValue(chain);
  const createUser = vi.fn().mockResolvedValue(createFails ? { data: { user: null }, error: new Error("exists") } : { data: { user: { id: "new-account" } }, error: null });
  const from = vi.fn().mockReturnValue(chain);
  return { client: { auth: { admin: { createUser } }, from } as unknown as SupabaseClient, createUser, from, chain };
}

describe("operator administrator bootstrap", () => {
  it("creates and approves an administrator with the delegation role", async () => {
    const f = fixture();
    expect(await bootstrapAdministrator(f.client, "admin@example.test", "Secure-Test-2048")).toBe("new-account");
    expect(f.chain.update).toHaveBeenCalledWith({ approved: true, leader_name: "Administrador" });
    expect(f.chain.upsert).toHaveBeenCalledWith({ user_id: "new-account", role: "admin" }, { onConflict: "user_id,role" });
  });
  it("never promotes an existing account or resets its password", async () => {
    const f = fixture(true);
    await expect(bootstrapAdministrator(f.client, "admin@example.test", "Secure-Test-2048")).rejects.toThrow("cuenta nueva");
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(["Aa1234567", "abcdefghij1", "ABCDEFGHIJ1", "Abcdefghijk"])("rejects an insecure password before contacting auth: %s", async (password) => {
    const f = fixture();
    await expect(bootstrapAdministrator(f.client, "admin@example.test", password)).rejects.toThrow("Mínimo 10");
    expect(f.createUser).not.toHaveBeenCalled();
  });
  it("fails closed if the profile is missing", async () => {
    const f = fixture();
    f.chain.single.mockResolvedValueOnce({ data: null, error: new Error("missing") });
    await expect(bootstrapAdministrator(f.client, "admin@example.test", "Secure-Test-2048")).rejects.toThrow("perfil");
    expect(f.chain.upsert).not.toHaveBeenCalled();
  });
});