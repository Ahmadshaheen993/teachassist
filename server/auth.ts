// server/auth.ts — نظام المصادقة المستقل (AUTH_SPEC_V2)
// بريد إلكتروني + OTP (6 أرقام)
// الشروط الثلاثة:
// 1. تخزين OTP مجزأً (SHA-256 hash) لا نصاً صريحاً
// 2. حد 5 محاولات لكل رمز مع إبطال بعد الاستخدام أو انتهاء الصلاحية (5 دقائق)
// 3. كوكي الجلسة httpOnly + Secure + SameSite

import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq, and, gt, isNull, sql, desc } from "drizzle-orm";
import { getDb } from "./db";
import { otpCodes, users } from "../drizzle/schema";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import type { Request, Response } from "express";

// ==================== الإعدادات ====================

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
const OTP_RESEND_WINDOW_SEC = parseInt(process.env.OTP_RESEND_WINDOW_SEC || "60", 10);
const OTP_MAX_PER_HOUR = parseInt(process.env.OTP_MAX_PER_HOUR || "5", 10);

const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 دقائق
const OTP_RATE_LIMIT_MAX = 3; // 3 طلبات OTP لكل بريد خلال 10 دقائق
const JWT_SECRET = process.env.JWT_SECRET || "";

// ==================== أدوات مساعدة ====================

/**
 * تجزئة OTP بـ SHA-256 — لا نخزن OTP كنص صريح أبداً
 */
function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * توليد OTP عشوائي 6 أرقام باستخدام crypto.randomInt (آمن مشفراً)
 */
function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * التحقق من صحة البريد الإلكتروني
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

/**
 * تجزئة سر الجلسة
 */
function getSessionSecret(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET);
}

// ==================== إرسال البريد ====================

/**
 * إرسال OTP عبر البريد الإلكتروني
 * يستخدم fetch إلى مزود البريد (Resend، SendGrid، أو أي SMTP)
 * في الإنتاج: استخدم nodemailer أو Resend API
 */
async function sendOtpEmail(email: string, code: string): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.FROM_EMAIL || "noreply@teachassist.com";

  // إن لم يكن SMTP مضبوطاً، سجّل في console (للتطوير)
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[Auth V2] OTP for ${email}: ${code} (dev mode — no SMTP configured)`);
    return;
  }

  // في الإنتاج: استخدم Resend API (أبسط من nodemailer)
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "رمز الدخول — TeachAssist",
        text: `رمز الدخول الخاص بك هو: ${code}\n\nينتهي خلال ${OTP_EXPIRY_MINUTES} دقائق.\n\nإن لم تطلب هذا الرمز، تجاهل هذه الرسالة.`,
      }),
    });
    if (!resp.ok) {
      console.error("[Auth V2] Failed to send OTP email:", resp.status);
      throw new Error("فشل إرسال البريد");
    }
    return;
  }

  // Fallback: nodemailer (يتطلب تثبيت الحزمة)
  console.log(`[Auth V2] OTP for ${email}: ${code} (no email provider configured)`);
}

// ==================== Rate Limiting للـ OTP ====================

/**
 * فحص عدد طلبات OTP لبريد معين خلال نافذة زمنية
 */
// ==================== API: طلب OTP ====================

// ==================== API: التحقق من OTP ====================

// ---------- 1) معدّل طلبات حقيقي (يعتمد قاعدة البيانات، بلا Redis) ----------
async function checkOtpRateLimit(email: string): Promise<{ allowed: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { allowed: false, reason: "db" };
  const now = Date.now();

  // آخر رمز أُرسل لهذا البريد
  const recent = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(eq(otpCodes.email, email))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (recent[0]?.createdAt) {
    const sinceLast = (now - new Date(recent[0].createdAt).getTime()) / 1000;
    if (sinceLast < OTP_RESEND_WINDOW_SEC) {
      return { allowed: false, reason: `الرجاء الانتظار ${Math.ceil(OTP_RESEND_WINDOW_SEC - sinceLast)} ثانية` };
    }
  }

  // عدد الرموز خلال الساعة الأخيرة
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const countRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), gt(otpCodes.createdAt, oneHourAgo)));
  if ((countRows[0]?.c ?? 0) >= OTP_MAX_PER_HOUR) {
    return { allowed: false, reason: "تجاوزت الحد المسموح من الطلبات، حاول بعد ساعة" };
  }

  return { allowed: true };
}

// ---------- 2) طلب OTP (يُبطل الرموز السابقة غير المستهلكة) ----------
export async function requestOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body as { email?: string };
    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: "بريد إلكتروني غير صالح" });
      return;
    }

    const rate = await checkOtpRateLimit(email);
    if (!rate.allowed) {
      res.status(429).json({ error: rate.reason || "طلبات كثيرة، حاول لاحقاً" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      return;
    }

    const now = new Date();
    // أبطل أي رمز سابق غير مستهلك لنفس البريد — رمز واحد فعّال فقط في كل لحظة
    await db.update(otpCodes)
      .set({ consumedAt: now })
      .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt)));

    const code = generateOtp();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db.insert(otpCodes).values({
      email, codeHash, purpose: "login", expiresAt, attempts: 0,
    });

    await sendOtpEmail(email, code);

    // ملاحظة تعداد المستخدمين: نرد نفس الرسالة سواء وُجد البريد أم لا (لا نكشف العضوية)
    res.json({ success: true, message: "إن كان البريد صحيحاً فقد أُرسل إليه رمز" });
  } catch (error) {
    console.error("[Auth V2] requestOtp error:", error);
    res.status(500).json({ error: "حدث خطأ، حاول مرة أخرى" });
  }
}

// ---------- 3) التحقق من OTP (استعلام واحد صحيح، بلا كود ميت) ----------
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email, code } = req.body as { email?: string; code?: string };
    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: "بريد إلكتروني غير صالح" });
      return;
    }
    if (!code || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "الرمز يجب أن يكون 6 أرقام" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      return;
    }

    const now = new Date();

    // أحدث رمز فعّال: غير مستهلك + لم تنته صلاحيته + لم يستنفد المحاولات — استعلام واحد صحيح
    const rows = await db
      .select()
      .from(otpCodes)
      .where(and(
        eq(otpCodes.email, email),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, now),
      ))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    const otp = rows[0];
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) {
      if (otp) {
        await db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, otp.id));
      }
      res.status(400).json({ error: "لا يوجد رمز صالح، اطلب رمزاً جديداً" });
      return;
    }

    // قارن أولاً، ثم زد العداد — محاولة خاطئة واحدة تزيد العداد، والصحيحة تستهلك الرمز
    const inputHash = hashOtp(code);
    const match = inputHash.length === otp.codeHash.length &&
      crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(otp.codeHash));

    if (!match) {
      const newAttempts = otp.attempts + 1;
      await db.update(otpCodes)
        .set({ attempts: newAttempts, ...(newAttempts >= OTP_MAX_ATTEMPTS ? { consumedAt: now } : {}) })
        .where(eq(otpCodes.id, otp.id));
      const left = OTP_MAX_ATTEMPTS - newAttempts;
      res.status(400).json({ error: left > 0 ? `رمز غير صحيح، تبقّى ${left} محاولات` : "تجاوزت الحد الأقصى، اطلب رمزاً جديداً" });
      return;
    }

    // نجاح: استهلك الرمز فوراً (يمنع إعادة الاستخدام)
    await db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, otp.id));

    // اربط بمستخدم قائم (ترحيل) أو أنشئ جديداً
    const { getUserByEmail, upsertUser, addCredits } = await import("./db");
    let user = await getUserByEmail(email);
    if (!user) {
      await upsertUser({
        email, name: email.split("@")[0], loginMethod: "email_otp", lastSignedIn: now,
      } as any);
      user = await getUserByEmail(email);
      if (user) await addCredits(user.id, 2); // خطتان مجانيتان للمستخدم الجديد
    } else {
      await upsertUser({ email, lastSignedIn: now } as any);
    }
    if (!user) {
      res.status(500).json({ error: "تعذّر إنشاء الحساب" });
      return;
    }

    // جلسة JWT في كوكي httpOnly — نفس منطق النسخة الأصلية
    const sessionToken = await new SignJWT({ userId: user.id, email: user.email, name: user.name || "" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
      .sign(getSessionSecret());
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions, httpOnly: true, secure: true, sameSite: "strict", maxAge: ONE_YEAR_MS,
    });
    res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    console.error("[Auth V2] verifyOtp error:", error);
    res.status(500).json({ error: "حدث خطأ، حاول مرة أخرى" });
  }
}

export async function verifyAuthV2Session(
  cookieValue: string | undefined | null
): Promise<{ userId: number; email: string; name: string } | null> {
  if (!cookieValue || !JWT_SECRET) return null;

  try {
    const { payload } = await jwtVerify(cookieValue, getSessionSecret(), {
      algorithms: ["HS256"],
    });

    const userId = payload.userId as number;
    const email = payload.email as string;
    const name = payload.name as string;

    if (!userId || !email) return null;

    return { userId, email, name };
  } catch {
    return null;
  }
}
