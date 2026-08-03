/**
 * Rate Limiter — حماية من استهلاك مفرط لموارد Anthropic API
 *
 * استراتيجية: نافذة منزلقة (sliding window) في الذاكرة
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

type RateLimitEntry = {
  count: number;
  windowStart: number;
};

// Map<key, Map<userId, RateLimitEntry>>
const rateLimitStore = new Map<string, Map<number, RateLimitEntry>>();

// Clean up old entries every 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((userMap, action) => {
    userMap.forEach((entry, userId) => {
      if (now - entry.windowStart > WINDOW_MS * 2) {
        userMap.delete(userId);
      }
    });
    if (userMap.size === 0) {
      rateLimitStore.delete(action);
    }
  });
}, CLEANUP_INTERVAL);

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
  userId: number,
  config: RateLimitConfig
): void {
  const { action, maxRequests, windowMs = WINDOW_MS } = config;
  const now = Date.now();

  if (!rateLimitStore.has(action)) {
    rateLimitStore.set(action, new Map());
  }

  const userMap = rateLimitStore.get(action)!;
  const entry = userMap.get(userId);

  if (!entry || now - entry.windowStart > windowMs) {
    // Start new window
    userMap.set(userId, { count: 1, windowStart: now });
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

// ==================== Preset Limits ====================

export const RATE_LIMITS = {
  generate: { action: "generate", maxRequests: 10 },
  worksheet: { action: "worksheet", maxRequests: 10 },
  redeem: { action: "redeem", maxRequests: 3 },
  buyPlan: { action: "buyPlan", maxRequests: 5 },
  buySemester: { action: "buySemester", maxRequests: 5 },
  indexPdf: { action: "indexPdf", maxRequests: 3 },
  exportDocx: { action: "exportDocx", maxRequests: 20 },
  exportPdf: { action: "exportPdf", maxRequests: 20 },
} as const;
