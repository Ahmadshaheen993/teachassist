/**
 * Rate Limiter — حماية من استهلاك مفرط لموارد Anthropic API
 *
 * استراتيجية: نافذة ثابتة (fixed window) في الذاكرة
 * - generate: 10 طلبات/ساعة لكل مستخدم
 * - worksheet: 10 طلبات/ساعة لكل مستخدم
 * - redeem: 3 طلبات/ساعة لكل مستخدم
 * - buyPlan/buySemester: 5 طلبات/ساعة لكل مستخدم
 * - indexPdf: 3 طلبات/ساعة لكل مستخدم (admin)
 *
 * ملاحظة: هذا حد في الذاكرة فقط. في الإنتاج مع أكثر من instance،
 * استخدم Redis بدلاً من ذلك.
 */

import { TRPCError } from "@trpc/server";
import type { Request } from "express";

type RateLimitEntry = {
  count: number;
  windowStart: number;
};

// Map<action, Map<subject, RateLimitEntry>>
const rateLimitStore = new Map<string, Map<string, RateLimitEntry>>();

// Clean up old entries every 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((userMap, action) => {
    userMap.forEach((entry, subject) => {
      if (now - entry.windowStart > WINDOW_MS * 2) {
        userMap.delete(subject);
      }
    });
    if (userMap.size === 0) {
      rateLimitStore.delete(action);
    }
  });
}, CLEANUP_INTERVAL);
cleanupTimer.unref();

interface RateLimitConfig {
  action: string;
  maxRequests: number;
  windowMs?: number;
}

/**
 * تحقق من حدود الاستهلاك للمستخدم الحالي.
 * يرمي TRPCError مع code=TOO_MANY_REQUESTS عند تجاوز الحد.
 */
export function checkRateLimit(
  subject: string | number,
  config: RateLimitConfig
): void {
  const { action, maxRequests, windowMs = WINDOW_MS } = config;
  const now = Date.now();

  if (!rateLimitStore.has(action)) {
    rateLimitStore.set(action, new Map());
  }

  const userMap = rateLimitStore.get(action)!;
  const subjectKey = String(subject);
  const entry = userMap.get(subjectKey);

  if (!entry || now - entry.windowStart > windowMs) {
    // Start new window
    userMap.set(subjectKey, { count: 1, windowStart: now });
    return;
  }

  if (entry.count >= maxRequests) {
    const resetInMs = entry.windowStart + windowMs - now;
    const resetInMin = Math.ceil(resetInMs / 60000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `لقد تجاوزت الحد المسموح (${maxRequests} طلبات/ساعة). حاول مرة أخرى بعد ${resetInMin} دقيقة.`,
    });
  }

  entry.count++;
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

export function getClientIp(req: Pick<Request, "ip" | "socket">): string {
  const candidate = req.ip || req.socket?.remoteAddress || "unknown";
  return normalizeIp(candidate);
}

/**
 * Payment limits bind the authenticated account to the resolved client IP.
 * Express resolves req.ip according to the explicitly configured trust proxy setting.
 */
export function checkPaymentRateLimit(
  userId: number,
  req: Pick<Request, "ip" | "socket">,
  config: RateLimitConfig
): void {
  checkRateLimit(`${userId}:${getClientIp(req)}`, config);
}

export function resetRateLimitStoreForTests(): void {
  rateLimitStore.clear();
}

// ==================== Preset Limits ====================

export const RATE_LIMITS = {
  generate: { action: "generate", maxRequests: 10 },
  worksheet: { action: "worksheet", maxRequests: 10 },
  redeem: { action: "redeem", maxRequests: 3 },
  buyPlan: { action: "buyPlan", maxRequests: 5 },
  buySemester: { action: "buySemester", maxRequests: 5 },
  paymentWebhook: { action: "paymentWebhook", maxRequests: 60, windowMs: 60 * 1000 },
  indexPdf: { action: "indexPdf", maxRequests: 3 },
  exportDocx: { action: "exportDocx", maxRequests: 20 },
  exportPdf: { action: "exportPdf", maxRequests: 20 },
} as const;
