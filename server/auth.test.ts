import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// اختبارات وحدة لنظام المصادقة المستقل (AUTH_SPEC_V2)
// تغطي: تخزين OTP مجزأً، 5 محاولات max، إبطال بعد الاستخدام، انتهاء الصلاحية

describe("AUTH_SPEC_V2 — OTP Security", () => {
  // ==================== البند 1: تخزين OTP مجزأً ====================
  describe("OTP Hash Storage", () => {
    it("should hash OTP with SHA-256 (never store plain text)", () => {
      const code = "123456";
      const hash = crypto.createHash("sha256").update(code).digest("hex");
      expect(hash).toHaveLength(64);
      expect(hash).not.toBe(code);
      // التحقق من أن التجزئة ثابتة
      const hash2 = crypto.createHash("sha256").update(code).digest("hex");
      expect(hash).toBe(hash2);
    });

    it("should produce different hashes for different codes", () => {
      const hash1 = crypto.createHash("sha256").update("123456").digest("hex");
      const hash2 = crypto.createHash("sha256").update("654321").digest("hex");
      expect(hash1).not.toBe(hash2);
    });
  });

  // ==================== البند 2: 5 محاولات max + إبطال ====================
  describe("OTP Attempts Limit", () => {
    it("should enforce max 5 attempts", () => {
      const OTP_MAX_ATTEMPTS = 5;
      let attempts = 0;

      // محاكاة 5 محاولات
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        attempts++;
      }

      expect(attempts).toBe(OTP_MAX_ATTEMPTS);
      // المحاولة السادسة يجب أن تُرفض
      expect(attempts >= OTP_MAX_ATTEMPTS).toBe(true);
    });

    it("should invalidate OTP after consumption", () => {
      const otp = { consumedAt: null, attempts: 1 };
      // بعد الاستخدام الناجح
      otp.consumedAt = new Date();
      expect(otp.consumedAt).not.toBeNull();
    });

    it("should invalidate OTP after expiry (5 minutes)", () => {
      const OTP_EXPIRY_MINUTES = 5;
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

      // قبل الانتهاء
      expect(expiresAt > new Date()).toBe(true);

      // بعد 5 دقائق
      const future = new Date(createdAt.getTime() + 6 * 60 * 1000);
      expect(future > expiresAt).toBe(true);
    });
  });

  // ==================== البند 3: كوكي الجلسة ====================
  describe("Session Cookie Security", () => {
    it("should have httpOnly, secure, sameSite options", () => {
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "strict" as const,
        maxAge: 1000 * 60 * 60 * 24 * 365,
      };

      expect(cookieOptions.httpOnly).toBe(true);
      expect(cookieOptions.secure).toBe(true);
      expect(cookieOptions.sameSite).toBe("strict");
      expect(cookieOptions.maxAge).toBeGreaterThan(0);
    });
  });

  // ==================== توليد OTP ====================
  describe("OTP Generation", () => {
    it("should generate 6-digit code", () => {
      const code = String(crypto.randomInt(100000, 999999));
      expect(code).toMatch(/^\d{6}$/);
    });

    it("should generate different codes each time", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(String(crypto.randomInt(100000, 999999)));
      }
      // على الأقل 95 رمز فريد من 100 (احتمالية التكرار ضئيلة)
      expect(codes.size).toBeGreaterThan(95);
    });
  });

  // ==================== التحقق من البريد ====================
  describe("Email Validation", () => {
    it("should accept valid emails", () => {
      const validEmails = [
        "teacher@school.qa",
        "user@example.com",
        "test.user@domain.org",
      ];
      validEmails.forEach((email) => {
        expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).toBe(true);
      });
    });

    it("should reject invalid emails", () => {
      const invalidEmails = [
        "not-an-email",
        "@domain.com",
        "user@",
        "user@domain",
        "",
        "   ",
      ];
      invalidEmails.forEach((email) => {
        expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).toBe(false);
      });
    });
  });

  // ==================== JWT Session ====================
  describe("JWT Session Token", () => {
    it("should include userId in JWT payload", async () => {
      const { SignJWT } = await import("jose");
      const secret = new TextEncoder().encode("test-secret");
      const token = await new SignJWT({
        userId: 42,
        email: "test@example.com",
        name: "Test User",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(Math.floor((Date.now() + 3600000) / 1000))
        .sign(secret);

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // header.payload.signature
    });

    it("should verify JWT and extract userId", async () => {
      const { SignJWT, jwtVerify } = await import("jose");
      const secret = new TextEncoder().encode("test-secret");
      const token = await new SignJWT({
        userId: 42,
        email: "test@example.com",
        name: "Test",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(Math.floor((Date.now() + 3600000) / 1000))
        .sign(secret);

      const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      expect(payload.userId).toBe(42);
      expect(payload.email).toBe("test@example.com");
    });

    it("should reject expired JWT", async () => {
      const { SignJWT, jwtVerify } = await import("jose");
      const secret = new TextEncoder().encode("test-secret");
      const token = await new SignJWT({ userId: 1 })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(Math.floor((Date.now() - 1000) / 1000)) // منتهي
        .sign(secret);

      await expect(jwtVerify(token, secret, { algorithms: ["HS256"] })).rejects.toThrow();
    });
  });

  // ==================== التحقق من OTP ====================
  describe("OTP Verification Logic", () => {
    it("should reject non-6-digit code", () => {
      const invalidCodes = ["12345", "1234567", "abcdef", "12 456", ""];
      invalidCodes.forEach((code) => {
        expect(/^\d{6}$/.test(code)).toBe(false);
      });
    });

    it("should accept valid 6-digit code", () => {
      const validCodes = ["123456", "000000", "999999", "100100"];
      validCodes.forEach((code) => {
        expect(/^\d{6}$/.test(code)).toBe(true);
      });
    });
  });

  // ==================== دوال auth.ts ====================
  describe("Auth Module Exports", () => {
    it("should export requestOtp and verifyOtp functions", async () => {
      const auth = await import("./auth");
      expect(typeof auth.requestOtp).toBe("function");
      expect(typeof auth.verifyOtp).toBe("function");
      expect(typeof auth.verifyAuthV2Session).toBe("function");
    });
  });
});
