import { beforeEach, describe, expect, it } from "vitest";
import { isPaymentsEnabled } from "./paymentConfig";
import { validateAmountAndCurrency } from "./payments";
import {
  RATE_LIMITS,
  checkPaymentRateLimit,
  resetRateLimitStoreForTests,
} from "./rateLimiter";

describe("payment kill switch", () => {
  it("fails closed unless PAYMENTS_ENABLED is exactly true", () => {
    expect(isPaymentsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isPaymentsEnabled({ PAYMENTS_ENABLED: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isPaymentsEnabled({ PAYMENTS_ENABLED: "TRUE" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isPaymentsEnabled({ PAYMENTS_ENABLED: "1" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isPaymentsEnabled({ PAYMENTS_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("amount and currency matching", () => {
  it("matches canonical two-decimal amounts", () => {
    expect(validateAmountAndCurrency("150.00", "QAR", "150.00", "QAR")).toBe(true);
    expect(validateAmountAndCurrency(150, "QAR", "150.00", "QAR")).toBe(true);
  });

  it("rejects missing or mismatched currency without a fallback", () => {
    expect(validateAmountAndCurrency("150.00", undefined, "150.00", "QAR")).toBe(false);
    expect(validateAmountAndCurrency("150.00", "AED", "150.00", "QAR")).toBe(false);
  });

  it("rejects malformed or over-precise amounts", () => {
    expect(validateAmountAndCurrency("150.001", "QAR", "150.00", "QAR")).toBe(false);
    expect(validateAmountAndCurrency("not-a-number", "QAR", "150.00", "QAR")).toBe(false);
  });
});

describe("payment rate-limit identity", () => {
  beforeEach(() => resetRateLimitStoreForTests());

  it("combines the user account and resolved IP", () => {
    const reqA = { ip: "203.0.113.10", socket: {} } as any;
    const reqB = { ip: "203.0.113.11", socket: {} } as any;
    const limit = { ...RATE_LIMITS.buyPlan, maxRequests: 1 };

    checkPaymentRateLimit(7, reqA, limit);
    expect(() => checkPaymentRateLimit(7, reqA, limit)).toThrow();
    expect(() => checkPaymentRateLimit(7, reqB, limit)).not.toThrow();
    expect(() => checkPaymentRateLimit(8, reqA, limit)).not.toThrow();
  });
});
