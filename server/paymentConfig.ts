import { TRPCError } from "@trpc/server";

export const PAYMENTS_DISABLED_MESSAGE = "الدفع متوقف مؤقتاً لحين اكتمال اختبارات الأمان.";

/**
 * Fail closed: payments are enabled only by the exact value "true".
 */
export function isPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PAYMENTS_ENABLED === "true";
}

export function assertPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): void {
  if (!isPaymentsEnabled(env)) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: PAYMENTS_DISABLED_MESSAGE,
    });
  }
}

export function getPaymentHttpTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PAYMENT_HTTP_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 30_000) {
    return 10_000;
  }
  return parsed;
}
