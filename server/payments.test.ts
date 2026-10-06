import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import {
  createCheckout,
  getPaymentReadiness,
  isPaymentsEnabled,
  isCurrentPaymentTerm,
  PAYMENT_GATEWAYS,
} from "./payments";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
  getActiveCountries: vi.fn(),
  getCurrentTermForCountry: vi.fn(),
  createPurchase: vi.fn(),
  updatePurchaseStatus: vi.fn(),
}));

const country = {
  id: 2, code: "QA", nameAr: "قطر", currencyCode: "QAR",
  isActive: true, pricePerPlan: "10.00", pricePerSemester: "150.00",
};
const now = new Date("2026-10-06T12:00:00.000Z");
const term = { id: 12, countryId: 2, nameAr: "الأول", academicYear: "2026-2027", startDate: "2026-09-01", endDate: "2027-01-01" };
const context = {
  user: { id: 42, countryId: 1, role: "user", openId: "teacher", email: "teacher@example.com" },
  req: { headers: {}, protocol: "https" },
  res: {},
} as TrpcContext;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENTS_ENABLED", "false");
  vi.mocked(db.getUserById).mockResolvedValue({ ...context.user!, countryId: 2 });
  vi.mocked(db.getActiveCountries).mockResolvedValue([
    { ...country, id: 1, currencyCode: "USD", pricePerPlan: "5.00" },
    country,
  ]);
  vi.mocked(db.getCurrentTermForCountry).mockResolvedValue(term as any);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Payment release gate", () => {
  it.each([undefined, "", "false", "TRUE", "True", "1", " true", "true "])(
    "does not request payments for nonliteral true (%s)",
    (flag) => {
      vi.stubEnv("PAYMENTS_ENABLED", flag);
      expect(getPaymentReadiness().requested).toBe(false);
      expect(isPaymentsEnabled()).toBe(false);
    },
  );

  it("keeps all unreviewed providers unavailable even when true and credentials exist", () => {
    vi.stubEnv("PAYMENTS_ENABLED", "true");
    vi.stubEnv("MYFATOORAH_API_KEY", "configured");
    vi.stubEnv("TAP_SECRET_KEY", "configured");
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "configured");
    expect(getPaymentReadiness()).toMatchObject({ requested: true, enabled: false, gateways: [] });
  });

  for (const gateway of PAYMENT_GATEWAYS) {
    it.each(["false", "true"])("blocks direct checkout without contacting " + gateway + " when flag=%s", async (flag) => {
      vi.stubEnv("PAYMENTS_ENABLED", flag);
      const providerFetch = vi.fn();
      vi.stubGlobal("fetch", providerFetch);
      expect(await createCheckout({
        gateway, purchaseId: 1, amount: "10.00", currency: "QAR",
        customerName: "Teacher", description: "lesson",
      })).toMatchObject({ success: false });
      expect(providerFetch).not.toHaveBeenCalled();
    });

    for (const route of ["buyPlan", "buySemester"] as const) {
      it.each(["false", "true", "TRUE"])("blocks " + route + " for " + gateway + " before database access when flag=%s", async (flag) => {
        vi.stubEnv("PAYMENTS_ENABLED", flag);
        const result = await appRouter.createCaller(context).subscription[route]({ gateway });
        expect(result).toMatchObject({
          success: false,
          code: flag === "true" ? "PAYMENT_PROVIDER_UNAVAILABLE" : "PAYMENTS_DISABLED",
        });
        expect(db.getUserById).not.toHaveBeenCalled();
        expect(db.getActiveCountries).not.toHaveBeenCalled();
        expect(db.getCurrentTermForCountry).not.toHaveBeenCalled();
        expect(db.createPurchase).not.toHaveBeenCalled();
        expect(db.updatePurchaseStatus).not.toHaveBeenCalled();
      });
    }
  }

  it("requires authentication for purchase and readiness routes", async () => {
    const caller = appRouter.createCaller({ ...context, user: null });
    await expect(caller.subscription.buyPlan({ gateway: "tap" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.subscription.paymentConfig()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.createPurchase).not.toHaveBeenCalled();
  });
});

describe("Authenticated payment catalog", () => {
  it("uses the persisted user's country instead of session data or the first country", async () => {
    const result = await appRouter.createCaller(context).subscription.paymentConfig();
    expect(db.getUserById).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({ enabled: false, gateways: [], country: { id: 2, currencyCode: "QAR" } });
    expect(db.getCurrentTermForCountry).toHaveBeenCalledWith(2);
    expect(db.createPurchase).not.toHaveBeenCalled();
  });

  it("does not fall back to a country when the user has none", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ ...context.user!, countryId: null });
    expect(await appRouter.createCaller(context).subscription.paymentConfig()).toMatchObject({ country: null, semesterTerm: null });
    expect(db.getActiveCountries).not.toHaveBeenCalled();
  });

  it("rejects an inactive or unavailable user country", async () => {
    vi.mocked(db.getActiveCountries).mockResolvedValue([{ ...country, isActive: false }]);
    expect(await appRouter.createCaller(context).subscription.paymentConfig()).toMatchObject({ country: null, semesterTerm: null });
  });

  it("does not offer future terms returned by the DB fallback", async () => {
    vi.mocked(db.getCurrentTermForCountry).mockResolvedValue({ ...term, startDate: "2999-01-01", endDate: "2999-12-01" } as any);
    expect(await appRouter.createCaller(context).subscription.paymentConfig()).toMatchObject({ semesterTerm: null });
  });
});

describe("Payment term dates", () => {
  it("accepts both date strings and database Date objects on inclusive boundaries", () => {
    expect(isCurrentPaymentTerm(term, 2, new Date("2026-09-01T10:00:00Z"))).toBe(true);
    expect(isCurrentPaymentTerm({ ...term, startDate: new Date(term.startDate), endDate: new Date(term.endDate) }, 2, new Date("2027-01-01T22:00:00Z"))).toBe(true);
  });

  it.each([
    null,
    { ...term, countryId: 1 },
    { ...term, startDate: null },
    { ...term, endDate: undefined },
    { ...term, startDate: "2026-02-30" },
    { ...term, startDate: new Date("invalid") },
    { ...term, startDate: "2026-12-01" },
    { ...term, endDate: "2026-09-01" },
    { ...term, startDate: "2027-01-01", endDate: "2026-09-01" },
  ])("rejects missing, invalid, expired, future, reversed, or wrong-country terms (%s)", (invalid) => {
    expect(isCurrentPaymentTerm(invalid, 2, now)).toBe(false);
  });
});
