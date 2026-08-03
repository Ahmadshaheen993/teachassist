// server/payments.ts
// نظام الدفع الآمن: إنشاء جلسات الدفع + استقبال Webhooks موثّقة + التفعيل من السيرفر حصراً
// القاعدة الذهبية: لا نصدّق أبداً ما يرسله المتصفح أو حتى جسم الـ Webhook —
// نتحقق من حالة العملية بطلب مباشر من سيرفرنا إلى البوابة قبل أي تفعيل.

import { Router, type Request, type Response } from "express";
import {
  getPurchaseById,
  updatePurchaseStatus,
  addCredits,
  createSubscription,
  getCurrentTermForCountry,
  getUserById,
  getActiveCountries,
  linkRedemptionToPurchase,
  getRedemptionByUser,
  getReferralCodeById,
  countPaidSemesterRedemptions,
  getRewardByCode,
  createReferralReward,
} from "./db";

// ==================== الإعدادات ====================
// أضف هذه المتغيرات في .env — راجع FIXES.md
const MYFATOORAH_BASE = process.env.MYFATOORAH_BASE_URL || "https://api.myfatoorah.com";
const MYFATOORAH_KEY = process.env.MYFATOORAH_API_KEY || "";
const TAP_BASE = process.env.TAP_BASE_URL || "https://api.tap.company";
const TAP_SECRET = process.env.TAP_SECRET_KEY || "";
const APP_BASE_URL = process.env.APP_BASE_URL || ""; // مثال: https://prep.q-genius.com

// ==================== 1) إنشاء جلسة الدفع (Checkout) ====================

export async function createCheckout(opts: {
  gateway: "myfatoorah" | "tap";
  purchaseId: number;
  amount: string | number;
  currency: string;
  customerName: string;
  customerEmail?: string | null;
  description: string;
}): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  try {
    if (opts.gateway === "myfatoorah") {
      if (!MYFATOORAH_KEY) return { success: false, error: "MYFATOORAH_API_KEY غير مضبوط" };
      // مرجع: https://docs.myfatoorah.com — SendPayment ينشئ رابط فاتورة بكل وسائل الدفع
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
          CustomerReference: String(opts.purchaseId), // الربط الوحيد الموثوق مع قاعدتنا
          CallBackUrl: `${APP_BASE_URL}/subscription?status=success`,
          ErrorUrl: `${APP_BASE_URL}/subscription?status=failed`,
          InvoiceItems: [{ ItemName: opts.description, Quantity: 1, UnitPrice: Number(opts.amount) }],
        }),
      });
      const data: any = await resp.json();
      if (!data?.IsSuccess) {
        return { success: false, error: data?.Message || "فشل إنشاء فاتورة MyFatoorah" };
      }
      return { success: true, paymentUrl: data.Data.InvoiceURL };
    }

    // Tap — مرجع: https://developers.tap.company (Create a Charge)
    if (!TAP_SECRET) return { success: false, error: "TAP_SECRET_KEY غير مضبوط" };
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
        post: { url: `${APP_BASE_URL}/api/webhooks/tap` }, // Webhook لهذه العملية
      }),
    });
    const data: any = await resp.json();
    if (!data?.id || !data?.transaction?.url) {
      return { success: false, error: data?.errors?.[0]?.description || "فشل إنشاء عملية Tap" };
    }
    return { success: true, paymentUrl: data.transaction.url };
  } catch (e: any) {
    console.error("[payments] createCheckout failed:", e);
    return { success: false, error: e.message };
  }
}

// ==================== 2) التفعيل الموحّد (Idempotent) ====================
// تُستدعى فقط بعد تحقق مؤكد من البوابة. آمنة ضد التكرار: العملية المدفوعة لا تُفعَّل مرتين.

export async function activatePurchase(purchaseId: number, gatewayRef: string): Promise<void> {
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    console.error(`[payments] purchase ${purchaseId} not found`);
    return;
  }
  if (purchase.status === "paid") return; // مفعّلة سابقاً — Webhook مكرر

  await updatePurchaseStatus(purchaseId, "paid", gatewayRef);

  if (purchase.kind === "single_plan") {
    await addCredits(purchase.userId, purchase.quantity || 1);
    return;
  }

  // اشتراك فصلي: أنشئ الاشتراك للفصل الحالي/القادم في دولة المستخدم
  if (purchase.kind === "semester") {
    const buyer = await getUserById(purchase.userId);
    let countryId = buyer?.countryId ?? null;
    if (!countryId) {
      const active = await getActiveCountries();
      countryId = active[0]?.id ?? null;
    }
    const term = countryId ? await getCurrentTermForCountry(countryId) : null;
    if (!term) {
      // لا تُفشل الدفع — لكن سجّل بصوت عالٍ: يجب إدخال الفصول في جدول terms
      console.error(`[payments] NO TERM CONFIGURED for country ${countryId} — purchase ${purchaseId} paid but subscription NOT created!`);
      return;
    }
    await createSubscription({
      userId: purchase.userId,
      termId: term.id,
      source: "paid",
      purchaseId,
      startsAt: term.startDate,
      endsAt: term.endDate,
    });

    // ---- خطاف الإحالة: يُحتسب فقط على الاشتراكات الفصلية المدفوعة ----
    await handleReferralOnPaidSemester(purchase.userId, purchaseId);
  }
}

async function handleReferralOnPaidSemester(buyerId: number, purchaseId: number): Promise<void> {
  try {
    // 1) اربط استرداد الكود (إن وُجد) بهذا الشراء
    await linkRedemptionToPurchase(buyerId, purchaseId);

    // 2) هل لهذا المشتري كود مُسترد؟
    const redemption = await getRedemptionByUser(buyerId);
    if (!redemption) return;

    const code = await getReferralCodeById(redemption.codeId);
    if (!code || !code.isActive) return;

    // 3) عدّ الاشتراكات الفصلية المدفوعة عبر هذا الكود
    const paidCount = await countPaidSemesterRedemptions(code.id);
    if (paidCount < (code.rewardThreshold ?? 5)) return;

    // 4) المكافأة تُصرف مرة واحدة لكل كود
    const existingReward = await getRewardByCode(code.id);
    if (existingReward) return;

    // 5) امنح مالك الكود اشتراك فصل مجانياً في دولته
    const owner = await getUserById(code.ownerUserId);
    let countryId = owner?.countryId ?? null;
    if (!countryId) {
      const active = await getActiveCountries();
      countryId = active[0]?.id ?? null;
    }
    const term = countryId ? await getCurrentTermForCountry(countryId) : null;
    if (!term) {
      console.error(`[payments] reward due for code ${code.code} but no term configured for country ${countryId}`);
      return;
    }
    const subscriptionId = await createSubscription({
      userId: code.ownerUserId,
      termId: term.id,
      source: "referral_reward",
      startsAt: term.startDate,
      endsAt: term.endDate,
    });
    if (subscriptionId) {
      await createReferralReward(code.id, subscriptionId);
      console.log(`[payments] referral reward granted: code ${code.code} → user ${code.ownerUserId}`);
    }
  } catch (e) {
    console.error("[payments] referral hook failed:", e);
  }
}

// ==================== 3) Webhooks — التحقق ثم التفعيل ====================
// النمط الآمن: نستخرج معرف العملية من الـ Webhook، ثم نستعلم عن حالتها
// مباشرة من البوابة بمفتاحنا السري، ونطابق المبلغ والعملة قبل التفعيل.

export const paymentWebhooks = Router();

// --- MyFatoorah: اضبط رابط الـ Webhook في لوحة التحكم إلى {APP_BASE_URL}/api/webhooks/myfatoorah ---
paymentWebhooks.post("/myfatoorah", async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const invoiceId = body?.Data?.InvoiceId ?? body?.InvoiceId;
    if (!invoiceId) return res.status(200).json({ ignored: true });

    // تحقق مباشر من البوابة (لا نثق بجسم الـ Webhook)
    const verify = await fetch(`${MYFATOORAH_BASE}/v2/GetPaymentStatus`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${MYFATOORAH_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ Key: String(invoiceId), KeyType: "InvoiceId" }),
    });
    const status: any = await verify.json();
    if (!status?.IsSuccess) return res.status(500).json({ error: "verify failed" }); // 500 → البوابة تعيد المحاولة

    const d = status.Data;
    if (d?.InvoiceStatus !== "Paid") return res.status(200).json({ ignored: d?.InvoiceStatus });

    const purchaseId = Number(d.CustomerReference);
    const purchase = purchaseId ? await getPurchaseById(purchaseId) : null;
    if (!purchase) return res.status(200).json({ ignored: "no purchase" });

    // مطابقة المبلغ مع سجلنا — أي اختلاف = رفض وتسجيل
    // (العملة: اسم حقلها في رد GetPaymentStatus يختلف حسب إعدادات الحساب —
    //  اطبع الرد مرة واحدة في بيئة الاختبار وأضف مقارنة العملة، راجع FIXES.md)
    if (Number(d.InvoiceValue) !== Number(purchase.amount)) {
      console.error(`[payments] AMOUNT MISMATCH purchase ${purchaseId}: expected ${purchase.amount}, got ${d.InvoiceValue}`);
      return res.status(200).json({ ignored: "amount mismatch" });
    }

    await activatePurchase(purchaseId, String(invoiceId));
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[payments] myfatoorah webhook error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// --- Tap: يُرسل تلقائياً إلى post.url المحدد عند إنشاء العملية ---
paymentWebhooks.post("/tap", async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const chargeId = body?.id;
    if (!chargeId || !String(chargeId).startsWith("chg_")) return res.status(200).json({ ignored: true });

    // تحقق مباشر من البوابة
    const verify = await fetch(`${TAP_BASE}/v2/charges/${chargeId}`, {
      headers: { authorization: `Bearer ${TAP_SECRET}` },
    });
    const charge: any = await verify.json();
    if (!charge?.id) return res.status(500).json({ error: "verify failed" });

    if (charge.status !== "CAPTURED") return res.status(200).json({ ignored: charge.status });

    const purchaseId = Number(charge?.reference?.order);
    const purchase = purchaseId ? await getPurchaseById(purchaseId) : null;
    if (!purchase) return res.status(200).json({ ignored: "no purchase" });

    if (Number(charge.amount) !== Number(purchase.amount) || charge.currency !== purchase.currency) {
      console.error(`[payments] AMOUNT/CURRENCY MISMATCH purchase ${purchaseId}`);
      return res.status(200).json({ ignored: "mismatch" });
    }

    await activatePurchase(purchaseId, String(chargeId));
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[payments] tap webhook error:", e);
    return res.status(500).json({ error: e.message });
  }
});
