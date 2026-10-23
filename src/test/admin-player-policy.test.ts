import { describe, expect, it } from "vitest";
import { assertPlayerDeletionAllowed, assertAdminGrantAllowed } from "../lib/admin-player-policy";

describe("player deletion permissions", () => {
  it("rejects non-admins", () => {
    expect(() => assertPlayerDeletionAllowed("player", "other", false)).toThrow("Solo un administrador");
  });
  it("protects the current administrator", () => {
    expect(() => assertPlayerDeletionAllowed("admin", "admin", true)).toThrow("propia cuenta");
  });
  it("allows an administrator to delete another player", () => {
    expect(() => assertPlayerDeletionAllowed("admin", "other", true)).not.toThrow();
  });
});

describe("administrator grants", () => {
  it("rejects a non-admin granting administrator access", () => {
    expect(() => assertAdminGrantAllowed(false)).toThrow("Solo un administrador");
  });
  it("allows an existing administrator to grant access", () => {
    expect(() => assertAdminGrantAllowed(true)).not.toThrow();
  });
});