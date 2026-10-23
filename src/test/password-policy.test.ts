import { describe, expect, it } from "vitest";
import { isSecurePassword } from "../lib/password-policy";

describe("registration password requirements", () => {
  it("requires at least 10 characters", () => {
    expect(isSecurePassword("Abcdefgh1")).toBe(false);
    expect(isSecurePassword("Abcdefghi1")).toBe(true);
  });
  it("requires uppercase", () => expect(isSecurePassword("abcdefghij1")).toBe(false));
  it("requires lowercase", () => expect(isSecurePassword("ABCDEFGHIJ1")).toBe(false));
  it("requires a number", () => expect(isSecurePassword("Abcdefghijk")).toBe(false));
  it("does not require a symbol", () => expect(isSecurePassword("Abcdefghi1")).toBe(true));
});