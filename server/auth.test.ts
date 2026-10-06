import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { COOKIE_NAME } from "../shared/const";
import type { AuthIdentityLimit, OtpCode, User } from "../drizzle/schema";
import * as auth from "./auth";
import { createAuthHandlers, hashOtp, normalizeEmail, readAuthConfig, resolveOtpSession,
  revokeOtpSession, sendOtpEmail, type AuthStore, type AuthTransaction } from "./auth";

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./db", () => ({ getDb: vi.fn() }));

function user(id: number, email: string, openId = "legacy-id"): User {
  const now = new Date("2026-10-06T12:00:00Z");
  return { id, email, openId, name: "Teacher", loginMethod: "manus", role: "user", createdAt: now,
    updatedAt: now, lastSignedIn: now, countryId: null, schoolId: null, fullName: null };
}

// Contract adapter for handler tests. The SQL adapter is independently tested
// on the disposable MySQL CI service, including parallel issue/verify calls.
class MemoryStore implements AuthStore {
  otps: OtpCode[] = [];
  users: User[] = [];
  credits = new Map<number, number>();
  limits = new Map<string, AuthIdentityLimit>();
  sessions: { userId: number; tokenHash: string; expiresAt: Date; revokedAt: Date | null }[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  async locked<T>(keys: string[], now: Date, operation: (tx: AuthTransaction) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const backup = structuredClone({ otps: this.otps, users: this.users, credits: this.credits, limits: this.limits, sessions: this.sessions });
      try {
        keys.forEach(keyId => {
          if (!this.limits.has(keyId)) this.limits.set(keyId, { keyId, requestWindowAt: now, requestCount: 0,
            verifyWindowAt: now, verifyCount: 0, lastIssuedAt: null, lockedUntil: null });
        });
        return await operation({
          limits: this.limits,
          saveLimit: async row => { this.limits.set(row.keyId, structuredClone(row)); },
          invalidateOtps: async (email, consumedAt) => { this.otps.filter(o => o.email === email && !o.consumedAt).forEach(o => { o.consumedAt = consumedAt; }); },
          createOtp: async input => { const id = this.otps.length + 1; this.otps.push({ ...input, id, purpose: "login", consumedAt: null, attempts: 0 }); return id; },
          latestOtp: async email => this.otps.filter(o => o.email === email && !o.consumedAt).at(-1),
          updateOtp: async (id, values) => { Object.assign(this.otps.find(o => o.id === id)!, values); },
          usersByEmail: async email => this.users.filter(u => u.email?.trim().toLowerCase() === email),
          createEmailUser: async email => {
            const created = user(this.users.length + 1, email, `email:${email}`);
            this.users.push(created); this.credits.set(created.id, 2); return created;
          },
          signedIn: async (id, lastSignedIn) => { this.users.find(u => u.id === id)!.lastSignedIn = lastSignedIn; },
          createSession: async (userId, tokenHash, _now, expiresAt) => { this.sessions.push({ userId, tokenHash, expiresAt, revokedAt: null }); },
        });
      } catch (error) { Object.assign(this, backup); throw error; }
    });
    this.tail = run.catch(() => {});
    return run;
  }
  async invalidateOtp(id: number, now: Date) { this.otps.find(o => o.id === id)!.consumedAt = now; }
  async sessionUser(hash: string, now: Date) {
    const session = this.sessions.find(s => s.tokenHash === hash && !s.revokedAt && s.expiresAt > now);
    return session ? this.users.find(u => u.id === session.userId)! : null;
  }
  async revokeSession(hash: string, now: Date) { this.sessions.filter(s => s.tokenHash === hash).forEach(s => { s.revokedAt = now; }); }
}

function request(body: unknown, options: { ip?: string; origin?: string; contentType?: string; cookie?: string } = {}): Request {
  return { body, ip: options.ip || "198.51.100.10", protocol: "https",
    headers: { origin: options.origin ?? "https://teachassist.test", cookie: options.cookie },
    is: (type: string) => (options.contentType || "application/json") === type,
    socket: { remoteAddress: "198.51.100.10" },
  } as unknown as Request;
}
function response() {
  const result = { status: 200, body: undefined as any, headers: {} as Record<string, string>, cookies: [] as { name: string; token: string; options: Record<string, unknown> }[] };
  const res = {
    status: (status: number) => { result.status = status; return res; },
    json: (body: unknown) => { result.body = body; return res; },
    setHeader: (key: string, value: string) => { result.headers[key] = value; return res; },
    cookie: (name: string, token: string, options: Record<string, unknown>) => { result.cookies.push({ name, token, options }); return res; },
  } as unknown as Response;
  return { res, result };
}
const config = { enabled: true, secret: "auth-test-secret-32-characters-minimum", resendApiKey: "test-provider",
  fromEmail: "login@teachassist.test", allowedOrigin: "https://teachassist.test", production: true,
  legacyOAuthUrl: null, legacyAppId: null };

describe("Independent auth handlers", () => {
  let store: MemoryStore;
  let now: Date;
  let sendEmail: ReturnType<typeof vi.fn>;
  let handlers: ReturnType<typeof createAuthHandlers>;
  const dependencies = () => ({ getStore: async () => store, config: () => config, now: () => now });
  beforeEach(() => {
    store = new MemoryStore(); now = new Date("2026-10-06T12:00:00Z");
    sendEmail = vi.fn().mockResolvedValue(undefined);
    handlers = createAuthHandlers({ ...dependencies(), generateCode: () => "123456", sendEmail });
  });
  async function issue(email = "teacher@example.com", options = {}) {
    const out = response(); await handlers.requestOtp(request({ email }, options), out.res); return out.result;
  }
  async function verify(code = "123456", email = "teacher@example.com", options = {}) {
    const out = response(); await handlers.verifyOtp(request({ email, code }, options), out.res); return out.result;
  }

  it("fails closed when disabled or unconfigured without database access or sending", async () => {
    for (const overrides of [{ enabled: false }, { secret: "" }, { resendApiKey: "" }, { fromEmail: "" },
      { allowedOrigin: "" }, { allowedOrigin: "http://teachassist.test" }]) {
      const getStore = vi.fn();
      const closed = createAuthHandlers({ getStore, config: () => ({ ...config, ...overrides }), sendEmail });
      const out = response(); await closed.requestOtp(request({ email: "teacher@example.com" }), out.res);
      expect(out.result.status).toBe(503); expect(getStore).not.toHaveBeenCalled();
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("advertises dormant email and configured legacy login", () => {
    const closed = createAuthHandlers({ config: () => ({ ...config, enabled: false, legacyOAuthUrl: "https://legacy.example.com", legacyAppId: "app" }) });
    const out = response(); closed.config(request({}), out.res);
    expect(out.result.body).toEqual({ emailOtpEnabled: false, legacyOAuthEnabled: true, legacyOAuthUrl: "https://legacy.example.com", legacyAppId: "app" });
    expect(out.result.headers["Cache-Control"]).toBe("no-store");
  });
  it("normalizes email and stores an email/purpose-bound keyed hash", async () => {
    expect((await issue(" Teacher@Example.com ")).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith("teacher@example.com", "123456", config);
    expect(store.otps[0].codeHash).toBe(hashOtp("teacher@example.com", "123456", config.secret));
    expect(store.otps[0].codeHash).not.toBe(hashOtp("other@example.com", "123456", config.secret));
    expect(store.otps[0].codeHash).not.toBe(hashOtp("teacher@example.com", "123456", "other-secret"));
    const wrongPurpose = crypto.createHmac("sha256", config.secret).update(JSON.stringify(["teachassist:otp:v1", "register", "teacher@example.com", "123456"])).digest("hex");
    expect(store.otps[0].codeHash).not.toBe(wrongPurpose);
  });
  it("rejects bad runtime types, foreign origins and form submissions", async () => {
    expect((await issue(["teacher@example.com"] as any)).status).toBe(400);
    expect((await issue("teacher@example.com", { origin: "https://attacker.test" })).status).toBe(403);
    expect((await issue("teacher@example.com", { contentType: "application/x-www-form-urlencoded" })).status).toBe(415);
    const out = response(); await handlers.verifyOtp(request({ email: "teacher@example.com", code: 123456 }), out.res);
    expect(out.result.status).toBe(400); expect(store.otps).toHaveLength(0);
  });
  it("invalidates the challenge on failed delivery and reports failure", async () => {
    sendEmail.mockRejectedValue(new Error("provider-private-details"));
    const out = await issue(); expect(out.status).toBe(502); expect(out.body.error).not.toContain("provider-private-details");
    expect(store.otps[0].consumedAt).not.toBeNull(); expect((await verify()).status).toBe(400);
  });
  it("serializes concurrent resend attempts and consumes the older code", async () => {
    expect((await Promise.all([issue(), issue()])).map(r => r.status).sort()).toEqual([200, 429]);
    expect(store.otps).toHaveLength(1); now = new Date(now.getTime() + 60_000);
    expect((await issue()).status).toBe(200); expect(store.otps[0].consumedAt).not.toBeNull(); expect(store.otps[1].consumedAt).toBeNull();
  });
  it("limits email to five requests/hour and IP to thirty across addresses", async () => {
    for (let i = 0; i < 5; i++) { expect((await issue()).status).toBe(200); now = new Date(now.getTime() + 60_000); }
    expect((await issue()).status).toBe(429);
    for (let i = 0; i < 25; i++) expect((await issue(`person${i}@example.com`)).status).toBe(200);
    expect((await issue("last@example.com")).status).toBe(429);
  });
  it("counts parallel wrong guesses accurately, locks for fifteen minutes, and blocks resend", async () => {
    await issue(); await Promise.all(Array.from({ length: 5 }, () => verify("000000")));
    expect(store.otps[0].attempts).toBe(5); expect(store.otps[0].consumedAt).not.toBeNull();
    expect((await verify()).status).toBe(429); now = new Date(now.getTime() + 60_000); expect((await issue()).status).toBe(429);
    now = new Date(now.getTime() + 15 * 60_000); expect((await issue()).status).toBe(200);
  });
  it("rejects a code at its expiry boundary", async () => {
    await issue(); now = new Date(now.getTime() + 5 * 60_000); expect((await verify()).status).toBe(400); expect(store.sessions).toHaveLength(0);
  });
  it("creates only one account, credit grant and session on parallel correct reuse", async () => {
    await issue(); const results = await Promise.all([verify(), verify()]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]); expect(store.users).toHaveLength(1); expect(store.credits.get(1)).toBe(2);
    expect(store.sessions).toHaveLength(1); const success = results.find(r => r.status === 200)!;
    expect(success.cookies[0]).toMatchObject({ name: COOKIE_NAME, options: { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 86400_000 } });
    expect(success.cookies[0].token).toMatch(/^ta1\.[A-Za-z0-9_-]{43}$/); expect(store.sessions[0].tokenHash).not.toBe(success.cookies[0].token);
  });
  it("preserves existing Manus identity, role and balance", async () => {
    store.users.push({ ...user(12, " Teacher@Example.com "), role: "admin" }); store.credits.set(12, 7);
    await issue(); const out = await verify(); expect(out.status).toBe(200); expect(out.body.user).toMatchObject({ id: 12, role: "admin" });
    expect(store.users[0].openId).toBe("legacy-id"); expect(store.credits.get(12)).toBe(7);
  });
  it("rejects ambiguous legacy emails instead of choosing an account", async () => {
    store.users.push(user(1, "teacher@example.com"), user(2, "Teacher@example.com", "second-id"));
    await issue(); expect((await verify()).status).toBe(409); expect(store.sessions).toHaveLength(0);
  });
  it("authenticates from persisted sessions and revokes the raw token on logout", async () => {
    await issue(); const token = (await verify()).cookies[0].token; const req = request({}, { cookie: `${COOKIE_NAME}=${token}` });
    expect((await resolveOtpSession(req, dependencies())).user?.id).toBe(1); await revokeOtpSession(req, dependencies());
    expect(await resolveOtpSession(req, dependencies())).toEqual({ handled: true, user: null });
    expect(await resolveOtpSession(request({}, { cookie: `${COOKIE_NAME}=ta1.bad` }), dependencies())).toEqual({ handled: true, user: null });
    expect(await resolveOtpSession(request({}, { cookie: `${COOKIE_NAME}=legacy-jwt` }), dependencies())).toEqual({ handled: false, user: null });
  });
  it("denies the persisted session exactly seven days later", async () => {
    await issue(); const token = (await verify()).cookies[0].token; now = new Date(now.getTime() + 7 * 86400_000);
    expect(await resolveOtpSession(request({}, { cookie: `${COOKIE_NAME}=${token}` }), dependencies())).toEqual({ handled: true, user: null });
  });
  it("limits verification by IP across different identities", async () => {
    for (let i = 0; i < 20; i++) expect((await verify("000000", `missing${i}@example.com`)).status).toBe(400);
    expect((await verify("000000", "last@example.com")).status).toBe(429);
  });
});

describe("Provider and context integration", () => {
  it("uses Resend without SMTP and validates acceptance", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new globalThis.Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    await sendOtpEmail("teacher@example.com", "123456", config);
    expect(fetchSpy).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
    fetchSpy.mockResolvedValue(new globalThis.Response("{}", { status: 200 }));
    await expect(sendOtpEmail("teacher@example.com", "123456", config)).rejects.toThrow("AUTH_EMAIL_RESPONSE_INVALID");
    fetchSpy.mockResolvedValue(new globalThis.Response("private-error", { status: 401 }));
    await expect(sendOtpEmail("teacher@example.com", "123456", config)).rejects.toThrow("AUTH_EMAIL_DELIVERY_FAILED"); fetchSpy.mockRestore();
  });
  it("uses OTP user in tRPC context and never falls through an invalid OTP to Manus", async () => {
    const resolver = vi.spyOn(auth, "resolveOtpSession").mockResolvedValue({ handled: true, user: user(3, "teacher@example.com") });
    const { sdk } = await import("./_core/sdk"); const { createContext } = await import("./_core/context");
    const options = { req: request({}), res: response().res };
    expect((await createContext(options as any)).user?.id).toBe(3); expect(sdk.authenticateRequest).not.toHaveBeenCalled();
    resolver.mockResolvedValue({ handled: true, user: null }); expect((await createContext(options as any)).user).toBeNull();
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
    resolver.mockResolvedValue({ handled: false, user: null }); vi.mocked(sdk.authenticateRequest).mockResolvedValue(user(7, "legacy@example.com"));
    expect((await createContext(options as any)).user?.id).toBe(7); resolver.mockRestore();
  });
});

describe("Environment gate", () => {
  it("enables only on the exact true string", () => {
    for (const value of ["false", "TRUE", "1", "yes", "true "]) { vi.stubEnv("AUTH_OTP_ENABLED", value); expect(readAuthConfig().enabled).toBe(false); }
    vi.stubEnv("AUTH_OTP_ENABLED", "true"); expect(readAuthConfig().enabled).toBe(true); vi.unstubAllEnvs();
  });
  it("rejects non-string addresses", () => { expect(normalizeEmail(null)).toBeNull(); expect(normalizeEmail(["teacher@example.com"])).toBeNull(); });
});
