// server/payments.ts — نظام الدفع الآمن (مُصحح)
// PAYMENTS_ENABLED يجب أن يكون "true" حرفياً
// Drizzle transactions لـ atomicity
// فحص الفصل والدولة قبل الدفع
// توقيع رسمي لكل مزود

import { Router, type Request, type Response } from "express";
import express from "express";
import crypto from "crypto";
import * as db from "./db";
import * as paymentFuncs from "./db-payment-functions";
import { checkRateLimit, RATE_LIMITS } from "./rateLimiter";

// ==================== الإعدادات ====================

const PAYMENTS_ENABLED = process.env.PAYMENTS_ENABLED === "true";
const MYFATOORAH_BASE = process.env.MYFATOORAH_BASE_URL || "https://api.myfatoorah.com";
const MYFATOORAH_KEY = process.env.MYFATOORAH_API_KEY || "";
const TAP_BASE = process.env.TAP_BASE_URL || "https://api.tap.company";
const TAP_SECRET = process.env.TAP_SECRET_KEY || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const WEBHOOK_TIMEOUT_MS = 5000;

// Lemon Squeezy (وسيط بائع Merchant of Record) — https://docs.lemonsqueezy.com/api
const LS_API = "https://api.lemonsqueezy.com/v1";
const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY || "";
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID || "";
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "";
const LS_VARIANT_SINGLE = process.env.LEMONSQUEEZY_VARIANT_SINGLE_PLAN || "";
const LS_VARIANT_SEMESTER = process.env.LEMONSQUEEZY_VARIANT_SEMESTER || "";

// ==================== البند 1: PAYMENTS_ENABLED ====================

export function isPaymentsEnabled(): boolean {
  return PAYMENTS_ENABLED;
}

// ==================== البند 1: إنشاء جلسة الدفع ====================

export async function createCheckout(opts: {
  gateway: "myfatoorah" | "tap" | "lemonsqueezy";
  purchaseId: number;
  amount: string | number;
  currency: string;
  customerName: string;
  customerEmail?: string | null;
  description: string;
}): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  // البند 1: تحقق من PAYMENTS_ENABLED
  if (!isPaymentsEnabled()) {
    return { success: false, error: "نظام الدفع معطّل حالياً" };
  }

  // البند 8: لا تفترض QAR — تحقق من المبلغ والعملة
  if (!opts.amount || !opts.currency) {
    return { success: false, error: "المبلغ والعملة مطلوبان" };
  }

  try {
    if (opts.gateway === "myfatoorah") {
      if (!MYFATOORAH_KEY) return { success: false, error: "بوابة MyFatoorah غير مضبوطة" };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      // البند 9: معالجة timeout و resp.ok
      const resp = await fetch(`${MYFATOORAH_BASE}/v2/SendPayment`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${MYFATOORAH_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          CustomerName: opts.customerName || "Teacher",
          NotificationOption: "LNK",
          InvoiceValue: Number(opts.amount),
          DisplayCurrencyIso: opts.currency,
          Language: "AR",
          CustomerReference: String(opts.purchaseId),
          CallBackUrl: `${APP_BASE_URL}/subscription?status=success`,
          ErrorUrl: `${APP_BASE_URL}/subscription?status=failed`,
          InvoiceItems: [{ ItemName: opts.description, Quantity: 1, UnitPrice: Number(opts.amount) }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        return { success: false, error: "خطأ من بوابة الدفع" };
      }

      let data: any;
      try {
        data = await resp.json();
      } catch {
        return { success: false, error: "رد غير صالح من البوابة" };
      }

      if (!data?.IsSuccess) {
        return { success: false, error: "فشل إنشاء فاتورة" };
      }

      return { success: true, paymentUrl: data.Data.InvoiceURL };
    }

    if (opts.gateway === "lemonsqueezy") {
      // وسيط بائع: المنتجان معرّفان مسبقاً بسعر ثابت في لوحة LS،
      // فمطابقة القيمة تتم عبر variant (لا رقم مبلغ متغير).
      if (!LS_API_KEY || !LS_STORE_ID) return { success: false, error: "بوابة Lemon Squeezy غير مضبوطة" };
      const variantId = opts.description.includes("فصل") ? LS_VARIANT_SEMESTER : LS_VARIANT_SINGLE;
      if (!variantId) return { success: false, error: "منتج Lemon Squeezy غير مضبوط" };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      const resp = await fetch(`${LS_API}/checkouts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${LS_API_KEY}`,
          accept: "application/vnd.api+json",
          "content-type": "application/vnd.api+json",
        },
        body: JSON.stringify({
          data: {
            type: "checkouts",
            attributes: {
              checkout_data: {
                email: opts.customerEmail || undefined,
                custom: { purchase_id: String(opts.purchaseId) },
              },
              product_options: { redirect_url: `${APP_BASE_URL}/subscription?status=return` },
            },
            relationships: {
              store: { data: { type: "stores", id: String(LS_STORE_ID) } },
              variant: { data: { type: "variants", id: String(variantId) } },
            },
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) return { success: false, error: "خطأ من بوابة الدفع" };
      let data: any;
      try { data = await resp.json(); } catch { return { success: false, error: "رد غير صالح من البوابة" }; }
      const url = data?.data?.attributes?.url;
      if (!url) return { success: false, error: "فشل إنشاء جلسة الدفع" };
      return { success: true, paymentUrl: url };
    }

    // Tap
    if (!TAP_SECRET) return { success: false, error: "بوابة Tap غير مضبوطة" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const resp = await fetch(`${TAP_BASE}/v2/charges`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TAP_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(opts.amount),
        currency: opts.currency,
        description: opts.description,
        reference: { order: String(opts.purchaseId) },
        customer: { first_name: opts.customerName || "Teacher", email: opts.customerEmail || undefined },
        source: { id: "src_all" },
        redirect: { url: `${APP_BASE_URL}/subscription?status=return` },
        post: { url: `${APP_BASE_URL}/api/webhooks/tap` },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      return { success: false, error: "خطأ من بوابة الدفع" };
    }

    let data: any;
    try {
      data = await resp.json();
    } catch {
      return { success: false, error: "رد غير صالح من البوابة" };
    }

    if (!data?.id || !data?.transaction?.url) {
      return { success: false, error: "فشل إنشاء عملية" };
    }

    return { success: true, paymentUrl: data.transaction.url };
  } catch (e: any) {
    console.error("[payments] createCheckout failed:", e);
    return { success: false, error: "حدث خطأ في معالجة الطلب" };
  }
}

// ==================== البند 7: التحقق الرسمي للمزودين ====================

/**
 * التحقق من توقيع MyFatoorah
 * MyFatoorah يستخدم HMAC-SHA256 على JSON payload
 */
function verifyMyFatoorahSignature(payload: string, signature: string, apiKey: string): boolean {
  if (!signature || !apiKey) return false;
  try {
    const computed = crypto.createHmac("sha256", apiKey).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * التحقق من توقيع Tap
 * Tap يستخدم HMAC-SHA256 على JSON payload
 */
function verifyTapSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const computed = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * التحقق من توقيع Lemon Squeezy — HMAC-SHA256 على الجسم الخام، ترويسة X-Signature
 */
function verifyLemonSqueezySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  try {
    const computed = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ==================== Webhooks ====================

export const paymentWebhooks = Router();

// حفظ raw body قبل express.json (البند 7)
paymentWebhooks.use(express.raw({ type: "application/json" }));

paymentWebhooks.post("/myfatoorah", async (req: Request, res: Response) => {
  try {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const signature = req.headers["x-signature"] as string;

    // البند 7: التحقق الرسمي
    if (!verifyMyFatoorahSignature(rawBody, signature, MYFATOORAH_KEY)) {
      console.warn("[payments] MyFatoorah signature verification failed");
      return res.status(401).json({ error: "Unauthorized" });
    }

    let body: any;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const invoiceId = body?.Data?.InvoiceId ?? body?.InvoiceId;
    if (!invoiceId) return res.status(200).json({ ignored: true });

    // البند 5: تحقق من أن الـ webhook لم يُعالج سابقاً
    const processed = await paymentFuncs.isWebhookProcessed("myfatoorah", String(invoiceId));
    if (processed) {
      return res.status(200).json({ ok: true }); // Idempotent
    }

    const purchaseId = Number(body?.Data?.CustomerReference);
    if (!purchaseId || purchaseId <= 0) {
      return res.status(200).json({ ignored: "no purchase" });
    }

    const purchase = await db.getPurchaseById(purchaseId);
    if (!purchase || purchase.status !== "pending") {
      return res.status(200).json({ ignored: "invalid purchase" });
    }

    // البند 8: لا تفترض QAR — تحقق من العملة
    const currency = body?.Data?.DisplayCurrencyIso;
    if (!currency || currency !== purchase.currency) {
      await paymentFuncs.logPaymentAudit({
        purchaseId,
        userId: purchase.userId,
        gateway: "myfatoorah",
        status: "mismatch",
        error: "Currency mismatch",
      });
      return res.status(200).json({ ignored: "currency mismatch" });
    }

    // البند 8: تحقق من المبلغ
    const amount = Number(body?.Data?.InvoiceValue);
    if (amount !== Number(purchase.amount)) {
      await paymentFuncs.logPaymentAudit({
        purchaseId,
        userId: purchase.userId,
        gateway: "myfatoorah",
        status: "mismatch",
        error: "Amount mismatch",
      });
      return res.status(200).json({ ignored: "amount mismatch" });
    }

    // البند 2: تفعيل مع transaction
    const result = await paymentFuncs.activatePurchaseTransaction(purchaseId, String(invoiceId));
    if (!result.success) {
      return res.status(500).json({ error: "Failed to activate" });
    }

    // البند 5: سجّل الـ webhook كمعالج
    await paymentFuncs.recordWebhookEvent("myfatoorah", String(invoiceId), body);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[payments] myfatoorah webhook error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
});

paymentWebhooks.post("/tap", async (req: Request, res: Response) => {
  try {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const signature = req.headers["x-tap-signature"] as string;

    // البند 7: التحقق الرسمي
    if (!verifyTapSignature(rawBody, signature, TAP_SECRET)) {
      console.warn("[payments] Tap signature verification failed");
      return res.status(401).json({ error: "Unauthorized" });
    }

    let body: any;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const chargeId = body?.id;
    if (!chargeId || !String(chargeId).startsWith("chg_")) {
      return res.status(200).json({ ignored: true });
    }

    // البند 5: تحقق من أن الـ webhook لم يُعالج سابقاً
    const processed = await paymentFuncs.isWebhookProcessed("tap", chargeId);
    if (processed) {
      return res.status(200).json({ ok: true }); // Idempotent
    }

    if (body.status !== "CAPTURED") {
      return res.status(200).json({ ignored: body.status });
    }

    const purchaseId = Number(body?.reference?.order);
    if (!purchaseId || purchaseId <= 0) {
      return res.status(200).json({ ignored: "no purchase" });
    }

    const purchase = await db.getPurchaseById(purchaseId);
    if (!purchase || purchase.status !== "pending") {
      return res.status(200).json({ ignored: "invalid purchase" });
    }

    // البند 8: لا تفترض QAR
    const currency = body?.currency;
    if (!currency || currency !== purchase.currency) {
      await paymentFuncs.logPaymentAudit({
        purchaseId,
        userId: purchase.userId,
        gateway: "tap",
        status: "mismatch",
        error: "Currency mismatch",
      });
      return res.status(200).json({ ignored: "currency mismatch" });
    }

    // البند 8: تحقق من المبلغ
    const amount = Number(body?.amount);
    if (amount !== Number(purchase.amount)) {
      await paymentFuncs.logPaymentAudit({
        purchaseId,
        userId: purchase.userId,
        gateway: "tap",
        status: "mismatch",
        error: "Amount mismatch",
      });
      return res.status(200).json({ ignored: "amount mismatch" });
    }

    // البند 2: تفعيل مع transaction
    const result = await paymentFuncs.activatePurchaseTransaction(purchaseId, chargeId);
    if (!result.success) {
      return res.status(500).json({ error: "Failed to activate" });
    }

    // البند 5: سجّل الـ webhook كمعالج
    await paymentFuncs.recordWebhookEvent("tap", chargeId, body);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[payments] tap webhook error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
});

paymentWebhooks.post("/lemonsqueezy", async (req: Request, res: Response) => {
  try {
    const rawBody = typeof req.body === "string" ? req.body : req.body?.toString?.() ?? JSON.stringify(req.body);
    const signature = req.headers["x-signature"] as string;

    // البند 7: التحقق الرسمي بالتوقيع على الجسم الخام
    if (!verifyLemonSqueezySignature(rawBody, signature, LS_WEBHOOK_SECRET)) {
      console.warn("[payments] Lemon Squeezy signature verification failed");
      return res.status(401).json({ error: "Unauthorized" });
    }

    let body: any;
    try {
      body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    if (body?.meta?.event_name !== "order_created") {
      return res.status(200).json({ ignored: body?.meta?.event_name });
    }

    const orderId = String(body?.data?.id ?? "");
    if (!orderId) return res.status(200).json({ ignored: true });

    // البند 5: idempotency
    const processed = await paymentFuncs.isWebhookProcessed("lemonsqueezy", orderId);
    if (processed) return res.status(200).json({ ok: true });

    const purchaseId = Number(body?.meta?.custom_data?.purchase_id);
    if (!purchaseId || purchaseId <= 0) {
      return res.status(200).json({ ignored: "no purchase" });
    }

    const purchase = await db.getPurchaseById(purchaseId);
    if (!purchase || purchase.status !== "pending") {
      return res.status(200).json({ ignored: "invalid purchase" });
    }

    const attrs = body?.data?.attributes;
    if (attrs?.status !== "paid") {
      return res.status(200).json({ ignored: attrs?.status });
    }

    // مطابقة المنتج بدل المبلغ (السعر ثابت على مستوى variant لدى LS)
    const paidVariant = String(attrs?.first_order_item?.variant_id ?? "");
    const expectedVariant = purchase.kind === "semester" ? LS_VARIANT_SEMESTER : LS_VARIANT_SINGLE;
    if (!expectedVariant || paidVariant !== String(expectedVariant)) {
      await paymentFuncs.logPaymentAudit({
        purchaseId,
        userId: purchase.userId,
        gateway: "lemonsqueezy",
        status: "mismatch",
        error: "Variant mismatch",
      });
      return res.status(200).json({ ignored: "variant mismatch" });
    }

    // البند 2: تفعيل ذري
    const result = await paymentFuncs.activatePurchaseTransaction(purchaseId, `ls_${orderId}`);
    if (!result.success) {
      return res.status(500).json({ error: "Failed to activate" });
    }

    await paymentFuncs.recordWebhookEvent("lemonsqueezy", orderId, body);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[payments] lemonsqueezy webhook error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
});
