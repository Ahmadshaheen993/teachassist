import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { TRPCError } from "@trpc/server";
import {
  PaymentActivationError,
  activateVerifiedPurchase,
  countPaidSemesterRedemptions,
  createPaymentAuditLog,
  createReferralReward,
  createSubscription,
  getActiveCountries,
  getCurrentTermForCountry,
  getPurchaseById,
  getRedemptionByUser,
  getReferralCodeById,
  getRewardByCode,
  getTermById,
  getUserById,
  linkRedemptionToPurchase,
  type PaymentAuditStatus,
  type PaymentGateway,
} from "./db";
import {
  PAYMENTS_DISABLED_MESSAGE,
  getPaymentHttpTimeoutMs,
  isPaymentsEnabled,
} from "./paymentConfig";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "./rateLimiter";

const MYFATOORAH_BASE = process.env.MYFATOORAH_BASE_URL || "https://api.myfatoorah.com";
const MYFATOORAH_KEY = process.env.MYFATOORAH_API_KEY || "";
const TAP_BASE = process.env.TAP_BASE_URL || "https://api.tap.company";
const TAP_SECRET = process.env.TAP_SECRET_KEY || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";

const GENERIC_CHECKOUT_ERROR = "تعذر إنشاء رابط الدفع حالياً. يرجى المحاولة لاحقاً.";

class PaymentGatewayError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PaymentGatewayError";
  }
}

function buildUrl(base: string, path: string): string {
  let url: URL;
  try {
    url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  } catch {
    throw new PaymentGatewayError("INVALID_GATEWAY_URL");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new PaymentGatewayError("INSECURE_GATEWAY_URL");
  }
  return url.toString();
}

function getAppBaseUrl(): string {
  let url: URL;
  try {
    url = new URL(APP_BASE_URL);
  } catch {
    throw new PaymentGatewayError("APP_BASE_URL_INVALID");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new PaymentGatewayError("APP_BASE_URL_INSECURE");
  }
  return url.origin;
}

async function fetchGatewayJson<T>(url: string, init: RequestInit): Promise<T> {
  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(getPaymentHttpTimeoutMs()),
    });
  } catch (error) {
    const code = error instanceof Error && error.name === "TimeoutError"
      ? "GATEWAY_TIMEOUT"
      : "GATEWAY_NETWORK_ERROR";
    throw new PaymentGatewayError(code);
  }

  const body = await response.text();
  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    throw new PaymentGatewayError("GATEWAY_INVALID_JSON");
  }
  if (!response.ok) {
    throw new PaymentGatewayError(`GATEWAY_HTTP_${response.status}`);
  }
  return parsed as T;
}

function isSafePaymentUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return process.env.NODE_ENV !== "production" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toMinorUnits(value: unknown): number | null {
  const text = String(value ?? "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const whole = Number(match[1]);
  const minor = whole * 100 + Number(fraction || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

function toDateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function validateAmountAndCurrency(
  gatewayAmount: unknown,
  gatewayCurrency: unknown,
  expectedAmount: unknown,
  expectedCurrency: string,
): boolean {
  const actualMinor = toMinorUnits(gatewayAmount);
  const expectedMinor = toMinorUnits(expectedAmount);
  return actualMinor !== null &&
    expectedMinor !== null &&
    actualMinor === expectedMinor &&
    typeof gatewayCurrency === "string" &&
    gatewayCurrency === expectedCurrency;
}

function payloadHash(parts: Array<string | number>): string {
  return crypto.createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

async function safeAudit(data: {
  purchaseId?: number | null;
  userId?: number | null;
  gateway: PaymentGateway;
  status: PaymentAuditStatus;
  gatewayRef?: string | null;
  eventId?: string | null;
  errorCode?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await createPaymentAuditLog(data);
  } catch {
    console.error("[payments] audit write failed", {
      gateway: data.gateway,
      status: data.status,
      errorCode: data.errorCode,
    });
  }
}

export async function createCheckout(opts: {
  gateway: PaymentGateway;
  purchaseId: number;
  customerName: string;
  customerEmail?: string | null;
  description: string;
}): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  if (!isPaymentsEnabled()) {
    return { success: false, error: PAYMENTS_DISABLED_MESSAGE };
  }

  try {
    const purchase = await getPurchaseById(opts.purchaseId);
    if (!purchase || !purchase.countryId || purchase.status !== "pending" || purchase.gateway !== opts.gateway) {
      return { success: false, error: GENERIC_CHECKOUT_ERROR };
    }
    if (toMinorUnits(purchase.amount) === null || toMinorUnits(purchase.amount)! <= 0) {
      return { success: false, error: GENERIC_CHECKOUT_ERROR };
    }
    if (!/^[A-Z]{3,8}$/.test(purchase.currency)) {
      return { success: false, error: GENERIC_CHECKOUT_ERROR };
    }
    if (purchase.kind === "semester") {
      if (!purchase.termId) return { success: false, error: GENERIC_CHECKOUT_ERROR };
      const term = await getTermById(purchase.termId);
      const today = new Date().toISOString().slice(0, 10);
      if (!term || toDateKey(term.endDate) < today) return { success: false, error: GENERIC_CHECKOUT_ERROR };
    }

    const appBaseUrl = getAppBaseUrl();

    if (opts.gateway === "myfatoorah") {
      if (!MYFATOORAH_KEY) throw new PaymentGatewayError("MYFATOORAH_NOT_CONFIGURED");
      const data = await fetchGatewayJson<any>(buildUrl(MYFATOORAH_BASE, "v2/SendPayment"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${MYFATOORAH_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          CustomerName: opts.customerName || "Teacher",
          NotificationOption: "LNK",
          InvoiceValue: Number(purchase.amount),
          DisplayCurrencyIso: purchase.currency,
          Language: "AR",
          CustomerReference: String(purchase.id),
          CallBackUrl: `${appBaseUrl}/subscription?status=success`,
          ErrorUrl: `${appBaseUrl}/subscription?status=failed`,
          InvoiceItems: [{
            ItemName: opts.description,
            Quantity: 1,
            UnitPrice: Number(purchase.amount),
          }],
        }),
      });
      const paymentUrl = data?.Data?.InvoiceURL;
      if (!data?.IsSuccess || !isSafePaymentUrl(paymentUrl)) {
        throw new PaymentGatewayError("MYFATOORAH_CHECKOUT_REJECTED");
      }
      return { success: true, paymentUrl };
    }

    if (!TAP_SECRET) throw new PaymentGatewayError("TAP_NOT_CONFIGURED");
    const data = await fetchGatewayJson<any>(buildUrl(TAP_BASE, "v2/charges"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${TAP_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(purchase.amount),
        currency: purchase.currency,
        description: opts.description,
        reference: { order: String(purchase.id) },
        customer: {
          first_name: opts.customerName || "Teacher",
          email: opts.customerEmail || undefined,
        },
        source: { id: "src_all" },
        redirect: { url: `${appBaseUrl}/subscription?status=return` },
        post: { url: `${appBaseUrl}/api/webhooks/tap` },
      }),
    });
    const paymentUrl = data?.transaction?.url;
    if (typeof data?.id !== "string" || !isSafePaymentUrl(paymentUrl)) {
      throw new PaymentGatewayError("TAP_CHECKOUT_REJECTED");
    }
    return { success: true, paymentUrl };
  } catch (error) {
    const errorCode = error instanceof PaymentGatewayError ? error.code : "CHECKOUT_UNEXPECTED_ERROR";
    console.error("[payments] checkout failed", { gateway: opts.gateway, errorCode });
    await safeAudit({
      purchaseId: opts.purchaseId,
      gateway: opts.gateway,
      status: "failed",
      errorCode,
    });
    return { success: false, error: GENERIC_CHECKOUT_ERROR };
  }
}

async function handleReferralOnPaidSemester(buyerId: number, purchaseId: number): Promise<void> {
  try {
    await linkRedemptionToPurchase(buyerId, purchaseId);
    const redemption = await getRedemptionByUser(buyerId);
    if (!redemption) return;
    const code = await getReferralCodeById(redemption.codeId);
    if (!code?.isActive) return;
    const paidCount = await countPaidSemesterRedemptions(code.id);
    if (paidCount < (code.rewardThreshold ?? 5)) return;
    if (await getRewardByCode(code.id)) return;

    const owner = await getUserById(code.ownerUserId);
    let countryId = owner?.countryId ?? null;
    if (!countryId) {
      const active = await getActiveCountries();
      countryId = active[0]?.id ?? null;
    }
    const term = countryId ? await getCurrentTermForCountry(countryId) : null;
    if (!term) return;
    const subscriptionId = await createSubscription({
      userId: code.ownerUserId,
      termId: term.id,
      source: "referral_reward",
      startsAt: term.startDate,
      endsAt: term.endDate,
    });
    if (subscriptionId) await createReferralReward(code.id, subscriptionId);
  } catch {
    // Referral rewards are retriable operational work; never roll back a buyer entitlement.
    console.error("[payments] referral reward processing failed", { buyerId, purchaseId });
  }
}

async function completeVerifiedPurchase(input: {
  gateway: PaymentGateway;
  purchaseId: number;
  gatewayRef: string;
  eventId: string;
  amount: unknown;
  currency: unknown;
  providerStatus: string;
}): Promise<"activated" | "already_activated" | "rejected"> {
  const purchase = await getPurchaseById(input.purchaseId);
  if (!purchase || purchase.gateway !== input.gateway) {
    await safeAudit({
      gateway: input.gateway,
      status: "rejected",
      gatewayRef: input.gatewayRef,
      eventId: input.eventId,
      errorCode: "PURCHASE_NOT_FOUND_OR_GATEWAY_MISMATCH",
    });
    return "rejected";
  }

  if (!validateAmountAndCurrency(input.amount, input.currency, purchase.amount, purchase.currency)) {
    await safeAudit({
      purchaseId: purchase.id,
      userId: purchase.userId,
      gateway: input.gateway,
      status: "mismatch",
      gatewayRef: input.gatewayRef,
      eventId: input.eventId,
      errorCode: "AMOUNT_OR_CURRENCY_MISMATCH",
    });
    return "rejected";
  }

  const hash = payloadHash([
    input.gateway,
    input.gatewayRef,
    input.purchaseId,
    String(input.amount),
    String(input.currency),
    input.providerStatus,
  ]);
  const result = await activateVerifiedPurchase({
    purchaseId: purchase.id,
    gateway: input.gateway,
    gatewayRef: input.gatewayRef,
    eventId: input.eventId,
    payloadHash: hash,
  });
  if (result.outcome === "activated" && result.purchase.kind === "semester") {
    await handleReferralOnPaidSemester(result.purchase.userId, result.purchase.id);
  }
  return result.outcome;
}

export const paymentWebhooks = Router();

function limitWebhook(req: Request, gateway: PaymentGateway): void {
  checkRateLimit(getClientIp(req), {
    ...RATE_LIMITS.paymentWebhook,
    action: `${RATE_LIMITS.paymentWebhook.action}:${gateway}`,
  });
}

function getPaymentErrorCode(error: unknown): string {
  if (error instanceof PaymentActivationError || error instanceof PaymentGatewayError) {
    return error.code;
  }
  if (error instanceof TRPCError) return error.code;
  return "WEBHOOK_UNEXPECTED_ERROR";
}

paymentWebhooks.post("/myfatoorah", async (req: Request, res: Response) => {
  let purchaseId: number | null = null;
  let invoiceId: string | null = null;
  try {
    limitWebhook(req, "myfatoorah");
    invoiceId = String(req.body?.Data?.InvoiceId ?? req.body?.InvoiceId ?? "");
    if (!/^\d+$/.test(invoiceId)) return res.status(200).json({ ignored: true });
    if (!MYFATOORAH_KEY) throw new PaymentGatewayError("MYFATOORAH_NOT_CONFIGURED");

    const status = await fetchGatewayJson<any>(buildUrl(MYFATOORAH_BASE, "v2/GetPaymentStatus"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${MYFATOORAH_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ Key: invoiceId, KeyType: "InvoiceId" }),
    });
    const data = status?.Data;
    if (!status?.IsSuccess || !data) throw new PaymentGatewayError("MYFATOORAH_VERIFY_FAILED");
    if (data.InvoiceStatus !== "Paid") return res.status(200).json({ ignored: true });

    purchaseId = Number(data.CustomerReference);
    if (!Number.isSafeInteger(purchaseId) || purchaseId <= 0) {
      await safeAudit({
        gateway: "myfatoorah",
        status: "rejected",
        gatewayRef: invoiceId,
        eventId: invoiceId,
        errorCode: "INVALID_CUSTOMER_REFERENCE",
      });
      return res.status(200).json({ ignored: true });
    }
    if (typeof data.DisplayCurrencyIso !== "string") {
      await safeAudit({
        purchaseId,
        gateway: "myfatoorah",
        status: "rejected",
        gatewayRef: invoiceId,
        eventId: invoiceId,
        errorCode: "CURRENCY_MISSING",
      });
      return res.status(200).json({ ignored: true });
    }

    const outcome = await completeVerifiedPurchase({
      gateway: "myfatoorah",
      purchaseId,
      gatewayRef: invoiceId,
      eventId: invoiceId,
      amount: data.InvoiceValue,
      currency: data.DisplayCurrencyIso,
      providerStatus: data.InvoiceStatus,
    });
    return res.status(200).json({ ok: outcome !== "rejected" });
  } catch (error) {
    const errorCode = getPaymentErrorCode(error);
    const statusCode = errorCode === "TOO_MANY_REQUESTS" ? 429 : 500;
    if (statusCode !== 429) {
      await safeAudit({
        purchaseId,
        gateway: "myfatoorah",
        status: "failed",
        gatewayRef: invoiceId,
        eventId: invoiceId,
        errorCode,
      });
    }
    return res.status(statusCode).json({ error: "PAYMENT_PROCESSING_FAILED" });
  }
});

paymentWebhooks.post("/tap", async (req: Request, res: Response) => {
  let purchaseId: number | null = null;
  let chargeId: string | null = null;
  try {
    limitWebhook(req, "tap");
    chargeId = typeof req.body?.id === "string" ? req.body.id : null;
    if (!chargeId || !/^chg_[A-Za-z0-9_-]+$/.test(chargeId)) {
      return res.status(200).json({ ignored: true });
    }
    if (!TAP_SECRET) throw new PaymentGatewayError("TAP_NOT_CONFIGURED");

    const charge = await fetchGatewayJson<any>(
      buildUrl(TAP_BASE, `v2/charges/${encodeURIComponent(chargeId)}`),
      { headers: { authorization: `Bearer ${TAP_SECRET}` } },
    );
    if (charge?.id !== chargeId) throw new PaymentGatewayError("TAP_VERIFY_FAILED");
    if (charge.status !== "CAPTURED") return res.status(200).json({ ignored: true });

    purchaseId = Number(charge?.reference?.order);
    if (!Number.isSafeInteger(purchaseId) || purchaseId <= 0) {
      await safeAudit({
        gateway: "tap",
        status: "rejected",
        gatewayRef: chargeId,
        eventId: chargeId,
        errorCode: "INVALID_ORDER_REFERENCE",
      });
      return res.status(200).json({ ignored: true });
    }
    if (typeof charge.currency !== "string") {
      await safeAudit({
        purchaseId,
        gateway: "tap",
        status: "rejected",
        gatewayRef: chargeId,
        eventId: chargeId,
        errorCode: "CURRENCY_MISSING",
      });
      return res.status(200).json({ ignored: true });
    }

    const outcome = await completeVerifiedPurchase({
      gateway: "tap",
      purchaseId,
      gatewayRef: chargeId,
      eventId: chargeId,
      amount: charge.amount,
      currency: charge.currency,
      providerStatus: charge.status,
    });
    return res.status(200).json({ ok: outcome !== "rejected" });
  } catch (error) {
    const errorCode = getPaymentErrorCode(error);
    const statusCode = errorCode === "TOO_MANY_REQUESTS" ? 429 : 500;
    if (statusCode !== 429) {
      await safeAudit({
        purchaseId,
        gateway: "tap",
        status: "failed",
        gatewayRef: chargeId,
        eventId: chargeId,
        errorCode,
      });
    }
    return res.status(statusCode).json({ error: "PAYMENT_PROCESSING_FAILED" });
  }
});
