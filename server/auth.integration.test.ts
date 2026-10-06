import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { authIdentityLimits, authSessions, otpCodes, planCredits, users } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { createAuthHandlers, createDrizzleAuthStore, resolveOtpSession, revokeOtpSession, type AuthStore } from "./auth";

// This spec deletes fixture rows. Reject every destination except the explicitly
// named disposable loopback database BEFORE any connection or cleanup occurs.
const connectionUrl = process.env.AUTH_TEST_DATABASE_URL;
if (connectionUrl) {
  const url = new URL(connectionUrl);
  if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/teachassist_test" || url.search || url.hash) {
    throw new Error("AUTH_TEST_DATABASE_URL must target the disposable loopback teachassist_test database");
  }
}

const config = { enabled: true, secret: "disposable-auth-ci-secret-minimum-32-chars", resendApiKey: "mock-provider",
  fromEmail: "login@teachassist.test", allowedOrigin: "https://teachassist.test", production: true,
  legacyOAuthUrl: null, legacyAppId: null };

function req(body: unknown, cookie?: string): Request {
  return { body, ip: "198.51.100.30", protocol: "https", is: () => "application/json",
    headers: { origin: config.allowedOrigin, cookie } } as unknown as Request;
}
function output() {
  const result = { status: 200, body: {} as any, token: "" };
  const res = { status(code: number) { result.status = code; return res; },
    json(body: unknown) { result.body = body; return res; }, setHeader() {},
    cookie(_name: string, token: string) { result.token = token; return res; } } as unknown as Response;
  return { result, res };
}

describe.skipIf(!connectionUrl)("MySQL independent auth integration", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let store: AuthStore;
  let now: Date;
  let handlers: ReturnType<typeof createAuthHandlers>;
  const deps = () => ({ getStore: async () => store, config: () => config, now: () => now });

  beforeAll(async () => {
    pool = createPool(connectionUrl!);
    db = drizzle(pool);
    store = createDrizzleAuthStore(db);
    // CI applies tracked migrations first. An absent table is an actionable
    // migration failure, never papered over by test-only CREATE TABLE statements.
    await db.select().from(authIdentityLimits).limit(1);
  });
  beforeEach(async () => {
    await db.delete(authSessions);
    await db.delete(otpCodes);
    await db.delete(authIdentityLimits);
    await db.delete(planCredits);
    await db.delete(users);
    now = new Date("2026-10-06T12:00:00Z");
    handlers = createAuthHandlers({ ...deps(), generateCode: () => "123456", sendEmail: async () => {} });
  });
  afterAll(async () => { if (pool) await pool.end(); });

  async function issue(email = "auth-teacher@example.test") {
    const out = output(); await handlers.requestOtp(req({ email }), out.res); return out.result;
  }
  async function verify(code = "123456", email = "auth-teacher@example.test") {
    const out = output(); await handlers.verifyOtp(req({ email, code }), out.res); return out.result;
  }

  it("serializes parallel resend checks with a real database row lock", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => issue()));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 429)).toHaveLength(5);
    expect(await db.select().from(otpCodes)).toHaveLength(1);
  });
  it("counts parallel wrong guesses exactly and locks after five", async () => {
    await issue(); const results = await Promise.all(Array.from({ length: 8 }, () => verify("000000")));
    expect(results.filter(r => r.status === 400)).toHaveLength(5);
    expect(results.filter(r => r.status === 429)).toHaveLength(3);
    const [otp] = await db.select().from(otpCodes); expect(otp.attempts).toBe(5); expect(otp.consumedAt).not.toBeNull();
    expect((await issue()).status).toBe(429);
  });
  it("accepts one parallel correct verification, creates one user and grants two credits once", async () => {
    await issue(); const results = await Promise.all(Array.from({ length: 5 }, () => verify()));
    expect(results.filter(r => r.status === 200)).toHaveLength(1); expect(results.filter(r => r.status === 400)).toHaveLength(4);
    const rows = await db.select().from(users); expect(rows).toHaveLength(1); expect(rows[0].openId).toMatch(/^email:/);
    expect((await db.select().from(planCredits))[0].balance).toBe(2);
    expect(await db.select().from(authSessions)).toHaveLength(1);
    now = new Date(now.getTime() + 61_000); expect((await issue()).status).toBe(200); expect((await verify()).status).toBe(200);
    expect(await db.select().from(users)).toHaveLength(1); expect((await db.select().from(planCredits))[0].balance).toBe(2);
  });
  it("preserves existing Manus ID, role, openId and credits", async () => {
    const insert = await db.insert(users).values({ openId: "legacy-auth-test", email: " Auth-Teacher@Example.Test ", role: "admin" });
    const id = insert[0].insertId; await db.insert(planCredits).values({ userId: id, balance: 11 });
    await issue(); const result = await verify(); expect(result.status).toBe(200); expect(result.body.user).toMatchObject({ id, role: "admin" });
    expect((await db.select().from(users))[0].openId).toBe("legacy-auth-test");
    expect((await db.select().from(planCredits))[0].balance).toBe(11);
  });
  it("fails closed on duplicate normalized legacy emails", async () => {
    await db.insert(users).values([{ openId: "legacy-a", email: "auth-teacher@example.test" },
      { openId: "legacy-b", email: "AUTH-TEACHER@example.test" }]);
    await issue(); expect((await verify()).status).toBe(409); expect(await db.select().from(authSessions)).toHaveLength(0);
  });
  it("rolls back consumption, account and credits if session creation fails", async () => {
    await issue(); const realStore = store;
    store = { ...realStore, locked: (keys, time, operation) => realStore.locked(keys, time,
      tx => operation({ ...tx, createSession: async () => { throw new Error("injected-db-write-failure"); } })) };
    try {
      expect((await verify()).status).toBe(503);
      expect(await db.select().from(users)).toHaveLength(0); expect(await db.select().from(planCredits)).toHaveLength(0);
      expect((await db.select().from(otpCodes))[0].consumedAt).toBeNull();
    } finally { store = realStore; }
  });
  it("authenticates an opaque stored session and denies it after revocation or expiry", async () => {
    await issue(); const login = await verify(); const request = req({}, `${COOKIE_NAME}=${login.token}`);
    expect((await resolveOtpSession(request, deps())).user?.id).toBe(login.body.user.id);
    const session = (await db.select().from(authSessions))[0]; expect(session.tokenHash).toHaveLength(64); expect(session.tokenHash).not.toBe(login.token);
    await revokeOtpSession(request, deps()); expect((await resolveOtpSession(request, deps())).user).toBeNull();
    expect((await db.select().from(authSessions))[0].revokedAt).not.toBeNull();
    now = new Date(now.getTime() + 61_000); await issue(); const second = await verify();
    now = new Date(now.getTime() + 7 * 86400_000);
    expect((await resolveOtpSession(req({}, `${COOKIE_NAME}=${second.token}`), deps())).user).toBeNull();
  });
  it("keeps no more than five active sessions", async () => {
    for (let i = 0; i < 6; i++) {
      if (i === 5) now = new Date(now.getTime() + 3600_000);
      expect((await issue()).status).toBe(200); expect((await verify()).status).toBe(200);
      now = new Date(now.getTime() + 61_000);
    }
    const counts = await db.execute(sql`SELECT COUNT(*) AS count FROM auth_sessions WHERE revokedAt IS NULL`);
    expect(Number((counts[0] as any)[0].count)).toBe(5);
    expect((await db.select().from(authSessions)).filter(session => session.revokedAt !== null)).toHaveLength(1);
  });
});
