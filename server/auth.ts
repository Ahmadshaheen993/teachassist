import crypto from "node:crypto";
import { parse as parseCookie } from "cookie";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import {
  authIdentityLimits, authSessions, otpCodes, planCredits, users,
  type AuthIdentityLimit, type OtpCode, type User,
} from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDb } from "./db";

const SESSION_PREFIX = "ta1.";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type AuthConfig = {
  enabled: boolean;
  secret: string;
  resendApiKey: string;
  fromEmail: string;
  allowedOrigin: string;
  production: boolean;
  legacyOAuthUrl: string | null;
  legacyAppId: string | null;
};

export function readAuthConfig(): AuthConfig {
  const portal = process.env.VITE_OAUTH_PORTAL_URL;
  let legacyOAuthUrl: string | null = null;
  if (portal && process.env.OAUTH_SERVER_URL && process.env.VITE_APP_ID) {
    try {
      const url = new URL(portal);
      if (url.protocol === "https:") legacyOAuthUrl = url.origin + url.pathname.replace(/\/$/, "");
    } catch { /* An invalid portal must not produce a login link. */ }
  }
  return {
    enabled: process.env.AUTH_OTP_ENABLED === "true",
    secret: process.env.AUTH_OTP_SECRET || process.env.JWT_SECRET || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.FROM_EMAIL || "",
    allowedOrigin: process.env.APP_BASE_URL || "",
    production: process.env.NODE_ENV === "production",
    legacyOAuthUrl,
    legacyAppId: legacyOAuthUrl ? process.env.VITE_APP_ID! : null,
  };
}

function ready(config: AuthConfig): boolean {
  const origin = parseOrigin(config.allowedOrigin);
  return config.enabled && config.secret.length >= 32 && !!config.resendApiKey &&
    !!normalizeEmail(config.fromEmail) && !!origin && (!config.production || origin.startsWith("https://"));
}

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function hashOtp(email: string, code: string, secret: string): string {
  return crypto.createHmac("sha256", secret)
    .update(JSON.stringify(["teachassist:otp:v1", "login", email, code])).digest("hex");
}

function hashSession(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function identityKey(kind: "email" | "ip", value: string, secret: string): string {
  return `${kind}:${crypto.createHmac("sha256", secret)
    .update(JSON.stringify(["teachassist:rate:v1", kind, value])).digest("hex")}`;
}

function cookieToken(req: Request): string | undefined {
  try {
    const cookie = parseCookie(req.headers.cookie || "")[COOKIE_NAME];
    if (cookie) return cookie;
  } catch { /* Treat malformed cookies as absent. */ }
  const header = req.headers.authorization;
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

function isSessionToken(token: string | undefined): token is string {
  return !!token && /^ta1\.[A-Za-z0-9_-]{43}$/.test(token);
}

// Never trust arbitrary X-Forwarded-For headers. Railway's Express proxy trust
// must be explicitly configured at deployment before req.ip uses them.
function requestIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export interface AuthTransaction {
  limits: Map<string, AuthIdentityLimit>;
  saveLimit(limit: AuthIdentityLimit): Promise<void>;
  invalidateOtps(email: string, now: Date): Promise<void>;
  createOtp(input: { email: string; codeHash: string; expiresAt: Date; createdAt: Date }): Promise<number>;
  latestOtp(email: string): Promise<OtpCode | undefined>;
  updateOtp(id: number, values: { attempts?: number; consumedAt?: Date }): Promise<void>;
  usersByEmail(email: string): Promise<User[]>;
  createEmailUser(email: string, now: Date): Promise<User>;
  signedIn(userId: number, now: Date): Promise<void>;
  createSession(userId: number, tokenHash: string, now: Date, expiresAt: Date): Promise<void>;
}

export interface AuthStore {
  locked<T>(keys: string[], now: Date, operation: (tx: AuthTransaction) => Promise<T>): Promise<T>;
  invalidateOtp(id: number, now: Date): Promise<void>;
  sessionUser(tokenHash: string, now: Date): Promise<User | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function createDrizzleAuthStore(db: Database): AuthStore {
  return {
    async locked(keys, now, operation) {
      return db.transaction(async tx => {
        // Sorted inserts/locks give all concurrent requests the same lock order.
        const sortedKeys = Array.from(new Set(keys)).sort();
        for (const keyId of sortedKeys) {
          await tx.insert(authIdentityLimits).values({ keyId, requestWindowAt: now, verifyWindowAt: now })
            .onDuplicateKeyUpdate({ set: { keyId: sql`${authIdentityLimits.keyId}` } });
        }
        const rows = await tx.select().from(authIdentityLimits)
          .where(inArray(authIdentityLimits.keyId, sortedKeys)).orderBy(asc(authIdentityLimits.keyId)).for("update");
        const adapter: AuthTransaction = {
          limits: new Map(rows.map(row => [row.keyId, row])),
          async saveLimit(row) {
            const { keyId, ...values } = row;
            await tx.update(authIdentityLimits).set(values).where(eq(authIdentityLimits.keyId, keyId));
          },
          async invalidateOtps(email, consumedAt) {
            await tx.update(otpCodes).set({ consumedAt })
              .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt)));
          },
          async createOtp(input) {
            const result = await tx.insert(otpCodes).values({ ...input, purpose: "login", attempts: 0 });
            return result[0].insertId;
          },
          async latestOtp(email) {
            const rows = await tx.select().from(otpCodes)
              .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, "login"), isNull(otpCodes.consumedAt)))
              .orderBy(desc(otpCodes.createdAt), desc(otpCodes.id)).limit(1).for("update");
            return rows[0];
          },
          async updateOtp(id, values) {
            await tx.update(otpCodes).set(values).where(and(eq(otpCodes.id, id), isNull(otpCodes.consumedAt)));
          },
          async usersByEmail(email) {
            // Legacy data may have mixed case or surrounding spaces. Never
            // silently pick one account when two existing rows share an email.
            return tx.select().from(users).where(sql`LOWER(TRIM(${users.email})) = ${email}`).limit(2).for("update");
          },
          async createEmailUser(email, signedInAt) {
            const openId = `email:${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
            const result = await tx.insert(users).values({ openId, email, name: email.split("@")[0],
              loginMethod: "email_otp", lastSignedIn: signedInAt });
            const userId = result[0].insertId;
            // Account creation and the initial grant commit together. A failed
            // login transaction cannot leave a half-created account or grant twice.
            await tx.insert(planCredits).values({ userId, balance: 2 });
            const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
            if (!rows[0]) throw new Error("AUTH_USER_INSERT_FAILED");
            return rows[0];
          },
          async signedIn(userId, lastSignedIn) {
            await tx.update(users).set({ lastSignedIn }).where(eq(users.id, userId));
          },
          async createSession(userId, tokenHash, createdAt, expiresAt) {
            // Keep at most five sessions. User row has been locked by lookup.
            const active = await tx.select({ id: authSessions.id }).from(authSessions)
              .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, createdAt)))
              .orderBy(desc(authSessions.createdAt), desc(authSessions.id)).for("update");
            const oldIds = active.slice(4).map(row => row.id);
            if (oldIds.length) await tx.update(authSessions).set({ revokedAt: createdAt }).where(inArray(authSessions.id, oldIds));
            await tx.insert(authSessions).values({ userId, tokenHash, createdAt, expiresAt });
          },
        };
        return operation(adapter);
      });
    },
    async invalidateOtp(id, consumedAt) {
      await db.update(otpCodes).set({ consumedAt }).where(eq(otpCodes.id, id));
    },
    async sessionUser(tokenHash, now) {
      const rows = await db.select({ user: users }).from(authSessions).innerJoin(users, eq(authSessions.userId, users.id))
        .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))).limit(1);
      return rows[0]?.user || null;
    },
    async revokeSession(tokenHash, revokedAt) {
      await db.update(authSessions).set({ revokedAt }).where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
    },
  };
}

async function defaultStore(): Promise<AuthStore> {
  const db = await getDb();
  if (!db) throw new Error("AUTH_DATABASE_UNAVAILABLE");
  return createDrizzleAuthStore(db);
}

export async function sendOtpEmail(email: string, code: string, config: AuthConfig): Promise<void> {
  if (!config.resendApiKey || !normalizeEmail(config.fromEmail)) throw new Error("AUTH_EMAIL_UNCONFIGURED");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.fromEmail, to: [email], subject: "رمز الدخول — TeachAssist",
      text: `رمز الدخول الخاص بك: ${code}\nصالح لمدة 5 دقائق.\nإن لم تطلب هذا الرمز فتجاهل الرسالة.` }),
  });
  if (!response.ok) throw new Error("AUTH_EMAIL_DELIVERY_FAILED");
  // A 2xx response without an email ID is not a confirmed provider acceptance.
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !body.id) {
    throw new Error("AUTH_EMAIL_RESPONSE_INVALID");
  }
}

type Dependencies = {
  getStore: () => Promise<AuthStore>;
  config: () => AuthConfig;
  now: () => Date;
  generateCode: () => string;
  generateToken: () => string;
  sendEmail: (email: string, code: string, config: AuthConfig) => Promise<void>;
};

const defaultDependencies: Dependencies = {
  getStore: defaultStore,
  config: readAuthConfig,
  now: () => new Date(),
  generateCode: () => String(crypto.randomInt(100000, 1000000)),
  generateToken: () => SESSION_PREFIX + crypto.randomBytes(32).toString("base64url"),
  sendEmail: sendOtpEmail,
};

function resetWindow(row: AuthIdentityLimit, kind: "request" | "verify", now: Date): void {
  if (now.getTime() - row[`${kind}WindowAt`].getTime() >= HOUR_MS) {
    row[`${kind}WindowAt`] = now;
    row[`${kind}Count`] = 0;
  }
}

function allowedRequest(req: Request, res: Response, config: AuthConfig): boolean {
  if (!ready(config)) {
    res.status(503).json({ error: "تسجيل الدخول بالبريد غير متاح حالياً" });
    return false;
  }
  if (!req.is("application/json")) {
    res.status(415).json({ error: "نوع الطلب غير مدعوم" });
    return false;
  }
  const origin = req.headers.origin;
  const fetchSite = req.headers["sec-fetch-site"];
  if (typeof origin !== "string" || parseOrigin(origin) !== parseOrigin(config.allowedOrigin) || fetchSite === "cross-site") {
    res.status(403).json({ error: "مصدر الطلب غير مسموح" });
    return false;
  }
  return true;
}

export function createAuthHandlers(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides };
  return {
    config(_req: Request, res: Response): void {
      const config = deps.config();
      res.setHeader("Cache-Control", "no-store");
      res.json({ emailOtpEnabled: ready(config), legacyOAuthEnabled: !!config.legacyOAuthUrl,
        legacyOAuthUrl: config.legacyOAuthUrl, legacyAppId: config.legacyAppId });
    },
    async requestOtp(req: Request, res: Response): Promise<void> {
      const config = deps.config();
      if (!allowedRequest(req, res, config)) return;
      const email = normalizeEmail(req.body?.email);
      if (!email) { res.status(400).json({ error: "بريد إلكتروني غير صالح" }); return; }
      try {
        const store = await deps.getStore();
        const now = deps.now();
        const emailKey = identityKey("email", email, config.secret);
        const ipKey = identityKey("ip", requestIp(req), config.secret);
        const code = deps.generateCode();
        const result = await store.locked([emailKey, ipKey], now, async tx => {
          const emailLimit = tx.limits.get(emailKey)!;
          const ipLimit = tx.limits.get(ipKey)!;
          resetWindow(emailLimit, "request", now);
          resetWindow(ipLimit, "request", now);
          if (emailLimit.lockedUntil && emailLimit.lockedUntil > now) return { denied: true as const, retry: LOCK_MS / 1000 };
          if (emailLimit.lastIssuedAt && now.getTime() - emailLimit.lastIssuedAt.getTime() < RESEND_MS) {
            return { denied: true as const, retry: Math.ceil((RESEND_MS - now.getTime() + emailLimit.lastIssuedAt.getTime()) / 1000) };
          }
          if (emailLimit.requestCount >= 5 || ipLimit.requestCount >= 30) return { denied: true as const, retry: HOUR_MS / 1000 };
          emailLimit.requestCount++;
          ipLimit.requestCount++;
          emailLimit.lastIssuedAt = now;
          await tx.saveLimit(emailLimit);
          await tx.saveLimit(ipLimit);
          await tx.invalidateOtps(email, now);
          const id = await tx.createOtp({ email, codeHash: hashOtp(email, code, config.secret),
            expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS), createdAt: now });
          return { denied: false as const, id };
        });
        if (result.denied) {
          res.setHeader("Retry-After", String(result.retry));
          res.status(429).json({ error: "طلبات كثيرة، حاول لاحقاً" });
          return;
        }
        try { await deps.sendEmail(email, code, config); }
        catch {
          await store.invalidateOtp(result.id, deps.now());
          res.status(502).json({ error: "تعذّر إرسال رمز التحقق، حاول لاحقاً" });
          return;
        }
        res.json({ success: true, message: "أُرسل رمز التحقق إلى بريدك", expiresIn: OTP_LIFETIME_MS / 1000 });
      } catch {
        // Never log OTPs, addresses, tokens, provider bodies or database errors.
        console.error("[Auth] OTP request failed");
        res.status(503).json({ error: "خدمة تسجيل الدخول غير متاحة، حاول لاحقاً" });
      }
    },
    async verifyOtp(req: Request, res: Response): Promise<void> {
      const config = deps.config();
      if (!allowedRequest(req, res, config)) return;
      const email = normalizeEmail(req.body?.email);
      const code = req.body?.code;
      if (!email || typeof code !== "string" || !/^\d{6}$/.test(code)) {
        res.status(400).json({ error: "أدخل بريداً صالحاً ورمزاً من 6 أرقام" }); return;
      }
      try {
        const store = await deps.getStore();
        const now = deps.now();
        const emailKey = identityKey("email", email, config.secret);
        const ipKey = identityKey("ip", requestIp(req), config.secret);
        const token = deps.generateToken();
        const result = await store.locked([emailKey, ipKey], now, async tx => {
          const emailLimit = tx.limits.get(emailKey)!;
          const ipLimit = tx.limits.get(ipKey)!;
          resetWindow(ipLimit, "verify", now);
          if ((emailLimit.lockedUntil && emailLimit.lockedUntil > now) || ipLimit.verifyCount >= 20) {
            return { status: 429 as const, error: "محاولات كثيرة، حاول لاحقاً" };
          }
          ipLimit.verifyCount++;
          await tx.saveLimit(ipLimit);
          const otp = await tx.latestOtp(email);
          if (!otp || otp.expiresAt <= now || otp.attempts >= MAX_ATTEMPTS) {
            if (otp) await tx.updateOtp(otp.id, { consumedAt: now });
            return { status: 400 as const, error: "الرمز غير صالح أو انتهت صلاحيته، اطلب رمزاً جديداً" };
          }
          const inputHash = hashOtp(email, code, config.secret);
          const valid = /^[a-f0-9]{64}$/.test(otp.codeHash) &&
            crypto.timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(otp.codeHash, "hex"));
          if (!valid) {
            const attempts = otp.attempts + 1;
            await tx.updateOtp(otp.id, { attempts, ...(attempts >= MAX_ATTEMPTS ? { consumedAt: now } : {}) });
            if (attempts >= MAX_ATTEMPTS) {
              emailLimit.lockedUntil = new Date(now.getTime() + LOCK_MS);
              await tx.saveLimit(emailLimit);
            }
            return { status: 400 as const, error: "رمز غير صحيح" };
          }
          const matches = await tx.usersByEmail(email);
          if (matches.length > 1) return { status: 409 as const, error: "تعذّر ربط الحساب، تواصل مع الدعم" };
          await tx.updateOtp(otp.id, { consumedAt: now });
          const user = matches[0] || await tx.createEmailUser(email, now);
          await tx.signedIn(user.id, now);
          await tx.createSession(user.id, hashSession(token), now, new Date(now.getTime() + SESSION_LIFETIME_MS));
          return { status: 200 as const, user };
        });
        if (result.status !== 200) { res.status(result.status).json({ error: result.error }); return; }
        res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req),
          httpOnly: true, secure: config.production || getSessionCookieOptions(req).secure,
          sameSite: "lax", maxAge: SESSION_LIFETIME_MS });
        res.json({ success: true, user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role } });
      } catch {
        console.error("[Auth] OTP verification failed");
        res.status(503).json({ error: "خدمة تسجيل الدخول غير متاحة، حاول لاحقاً" });
      }
    },
  };
}

const handlers = createAuthHandlers();
export const requestOtp = handlers.requestOtp;
export const verifyOtp = handlers.verifyOtp;

export function registerAuthRoutes(app: Express): void {
  // Configure only after the staging deployment confirms its proxy topology.
  // A blanket trust=true would let clients forge IP rate-limit identities.
  const trustedHops = process.env.AUTH_TRUST_PROXY_HOPS;
  if (trustedHops && /^[12]$/.test(trustedHops)) app.set("trust proxy", Number(trustedHops));
  app.get("/api/auth/config", handlers.config);
  app.post("/api/auth/request-otp", handlers.requestOtp);
  app.post("/api/auth/verify-otp", handlers.verifyOtp);
}

export async function resolveOtpSession(req: Request, overrides: Partial<Dependencies> = {}): Promise<{ handled: boolean; user: User | null }> {
  const token = cookieToken(req);
  if (!token?.startsWith(SESSION_PREFIX)) return { handled: false, user: null };
  const deps = { ...defaultDependencies, ...overrides };
  if (!isSessionToken(token) || !ready(deps.config())) return { handled: true, user: null };
  return { handled: true, user: await (await deps.getStore()).sessionUser(hashSession(token), deps.now()) };
}

export async function revokeOtpSession(req: Request, overrides: Partial<Dependencies> = {}): Promise<void> {
  const token = cookieToken(req);
  if (!isSessionToken(token)) return;
  const deps = { ...defaultDependencies, ...overrides };
  await (await deps.getStore()).revokeSession(hashSession(token), deps.now());
}
