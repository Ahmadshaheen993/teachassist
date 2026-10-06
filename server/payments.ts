import { Router } from "express";

export const PAYMENT_GATEWAYS = ["myfatoorah", "tap", "lemonsqueezy"] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PAYMENTS_UNAVAILABLE_MESSAGE = "الدفع غير متاح حالياً. يرجى المحاولة لاحقاً.";

// None of the current integrations has passed provider and database settlement
// review. Credentials or PAYMENTS_ENABLED=true cannot bypass this release gate.
// Add a provider here only alongside its reviewed checkout/settlement code and
// passing staging evidence. The previous handlers must not grant entitlements.
const REVIEWED_PAYMENT_GATEWAYS: readonly PaymentGateway[] = Object.freeze([]);

export function getPaymentReadiness() {
  const requested = process.env.PAYMENTS_ENABLED === "true";
  const gateways = requested ? [...REVIEWED_PAYMENT_GATEWAYS] : [];
  return {
    requested,
    enabled: requested && gateways.length > 0,
    gateways,
    message: PAYMENTS_UNAVAILABLE_MESSAGE,
  };
}

export function isPaymentsEnabled(): boolean {
  return getPaymentReadiness().enabled;
}

export function getPaymentUnavailableReason(gateway: PaymentGateway) {
  const readiness = getPaymentReadiness();
  if (!readiness.requested) {
    return { success: false as const, code: "PAYMENTS_DISABLED", error: readiness.message };
  }
  if (!readiness.enabled || !readiness.gateways.includes(gateway)) {
    return { success: false as const, code: "PAYMENT_PROVIDER_UNAVAILABLE", error: readiness.message };
  }
  return null;
}

function calendarDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

// getCurrentTermForCountry may return the next future term; payment requires a
// current, complete interval belonging to the authenticated user's country.
export function isCurrentPaymentTerm(
  term: { countryId: number; startDate: unknown; endDate: unknown } | null | undefined,
  countryId: number,
  now = new Date(),
): boolean {
  if (!term || term.countryId !== countryId) return false;
  const starts = calendarDate(term.startDate);
  const ends = calendarDate(term.endDate);
  const today = calendarDate(now);
  return !!(starts && ends && today && starts <= today && today <= ends);
}

export async function createCheckout(opts: {
  gateway: PaymentGateway;
  purchaseId: number;
  amount: string | number;
  currency: string;
  customerName: string;
  customerEmail?: string | null;
  description: string;
}): Promise<{ success: boolean; paymentUrl?: string; error?: string; code?: string }> {
  // No provider request is made until a reviewed integration replaces this
  // quarantine. Even direct callers cannot reach the old checkout handlers.
  return getPaymentUnavailableReason(opts.gateway) ?? {
    success: false,
    code: "PAYMENT_PROVIDER_UNAVAILABLE",
    error: PAYMENTS_UNAVAILABLE_MESSAGE,
  };
}

export const paymentWebhooks = Router();

paymentWebhooks.post(PAYMENT_GATEWAYS.map(gateway => `/${gateway}`), (_req, res) => {
  // Do not acknowledge or activate an unverified payment. A temporary failure
  // lets providers retry; historical pending payments need reconciliation when
  // verified settlement is implemented. No body parsing or database work occurs.
  res.setHeader("Retry-After", "300");
  return res.status(503).json({ error: "PAYMENT_PROVIDER_UNAVAILABLE" });
});
