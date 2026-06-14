import { describe, expect, it, beforeAll } from "vitest";
import { createSessionToken, verifySessionToken } from "@core/auth/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long-xx";
});

describe("session token", () => {
  it("round-trips a valid payload", async () => {
    const token = await createSessionToken({ sub: "admin-1", email: "a@b.c" });
    const payload = await verifySessionToken(token);
    expect(payload?.sub).toBe("admin-1");
    expect(payload?.email).toBe("a@b.c");
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken({ sub: "admin-1", email: "a@b.c" });
    expect(await verifySessionToken(token + "x")).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });
});
