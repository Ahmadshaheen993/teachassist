import express from "express";
import http, { type AddressInfo } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitStoreForTests } from "./rateLimiter";

const mocks = vi.hoisted(() => {
  process.env.MYFATOORAH_API_KEY = "test-myfatoorah-key";
  process.env.TAP_SECRET_KEY = "test-tap-key";
  process.env.APP_BASE_URL = "https://teachassist.example";

  class MockPaymentActivationError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }

  return {
    MockPaymentActivationError,
    activateVerifiedPurchase: vi.fn(),
    createPaymentAuditLog: vi.fn(),
    getPurchaseById: vi.fn(),
    linkRedemptionToPurchase: vi.fn(),
    getRedemptionByUser: vi.fn(),
    getReferralCodeById: vi.fn(),
    countPaidSemesterRedemptions: vi.fn(),
    getRewardByCode: vi.fn(),
    getUserById: vi.fn(),
    getActiveCountries: vi.fn(),
    getCurrentTermForCountry: vi.fn(),
    createSubscription: vi.fn(),
    createReferralReward: vi.fn(),
    getTermById: vi.fn(),
  };
});

vi.mock("./db", () => ({
  PaymentActivationError: mocks.MockPaymentActivationError,
  activateVerifiedPurchase: mocks.activateVerifiedPurchase,
  createPaymentAuditLog: mocks.createPaymentAuditLog,
  getPurchaseById: mocks.getPurchaseById,
  linkRedemptionToPurchase: mocks.linkRedemptionToPurchase,
  getRedemptionByUser: mocks.getRedemptionByUser,
  getReferralCodeById: mocks.getReferralCodeById,
  countPaidSemesterRedemptions: mocks.countPaidSemesterRedemptions,
  getRewardByCode: mocks.getRewardByCode,
  getUserById: mocks.getUserById,
  getActiveCountries: mocks.getActiveCountries,
  getCurrentTermForCountry: mocks.getCurrentTermForCountry,
  createSubscription: mocks.createSubscription,
  createReferralReward: mocks.createReferralReward,
  getTermById: mocks.getTermById,
}));

import { paymentWebhooks } from "./payments";

let server: http.Server;
let port: number;

function postJson(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        body: responseBody ? JSON.parse(responseBody) : null,
      }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

function gatewayResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use("/api/webhooks", paymentWebhooks);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStoreForTests();
  mocks.getPurchaseById.mockResolvedValue({
    id: 42,
    userId: 7,
    countryId: 1,
    kind: "single_plan",
    termId: null,
    quantity: 1,
    amount: "150.00",
    currency: "QAR",
    gateway: "myfatoorah",
    gatewayRef: null,
    status: "pending",
    createdAt: new Date(),
  });
  mocks.activateVerifiedPurchase.mockResolvedValue({
    outcome: "activated",
    purchase: {
      id: 42,
      userId: 7,
      countryId: 1,
      kind: "single_plan",
      termId: null,
      quantity: 1,
      amount: "150.00",
      currency: "QAR",
      gateway: "myfatoorah",
      gatewayRef: "9001",
      status: "paid",
      createdAt: new Date(),
    },
  });
});

describe("payment webhook routes", () => {
  it("activates a MyFatoorah purchase only after server-side verification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gatewayResponse({
      IsSuccess: true,
      Data: {
        InvoiceStatus: "Paid",
        CustomerReference: "42",
        InvoiceValue: "150.00",
        DisplayCurrencyIso: "QAR",
      },
    })));

    const result = await postJson("/api/webhooks/myfatoorah", { Data: { InvoiceId: 9001 } });
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(mocks.activateVerifiedPurchase).toHaveBeenCalledWith(expect.objectContaining({
      purchaseId: 42,
      gateway: "myfatoorah",
      gatewayRef: "9001",
    }));
  });

  it("fails closed when MyFatoorah omits the currency", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gatewayResponse({
      IsSuccess: true,
      Data: {
        InvoiceStatus: "Paid",
        CustomerReference: "42",
        InvoiceValue: "150.00",
      },
    })));

    const result = await postJson("/api/webhooks/myfatoorah", { Data: { InvoiceId: 9002 } });
    expect(result.status).toBe(200);
    expect(mocks.activateVerifiedPurchase).not.toHaveBeenCalled();
    expect(mocks.createPaymentAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "CURRENCY_MISSING",
    }));
  });

  it("rejects a verified amount mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gatewayResponse({
      IsSuccess: true,
      Data: {
        InvoiceStatus: "Paid",
        CustomerReference: "42",
        InvoiceValue: "149.00",
        DisplayCurrencyIso: "QAR",
      },
    })));

    const result = await postJson("/api/webhooks/myfatoorah", { Data: { InvoiceId: 9003 } });
    expect(result).toEqual({ status: 200, body: { ok: false } });
    expect(mocks.activateVerifiedPurchase).not.toHaveBeenCalled();
    expect(mocks.createPaymentAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      status: "mismatch",
      errorCode: "AMOUNT_OR_CURRENCY_MISMATCH",
    }));
  });

  it("returns an idempotent success for an already activated purchase", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gatewayResponse({
      IsSuccess: true,
      Data: {
        InvoiceStatus: "Paid",
        CustomerReference: "42",
        InvoiceValue: "150.00",
        DisplayCurrencyIso: "QAR",
      },
    })));
    mocks.activateVerifiedPurchase.mockResolvedValueOnce({
      outcome: "already_activated",
      purchase: { kind: "single_plan" },
    });

    const result = await postJson("/api/webhooks/myfatoorah", { Data: { InvoiceId: 9004 } });
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it("does not expose provider errors to the webhook caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gatewayResponse({
      error: "sensitive provider detail",
    }, 500)));

    const result = await postJson("/api/webhooks/myfatoorah", { Data: { InvoiceId: 9005 } });
    expect(result).toEqual({ status: 500, body: { error: "PAYMENT_PROCESSING_FAILED" } });
    expect(JSON.stringify(result.body)).not.toContain("sensitive");
  });

  it("verifies Tap charge identity, amount and currency before activation", async () => {
    mocks.getPurchaseById.mockResolvedValueOnce({
      id: 42,
      userId: 7,
      countryId: 1,
      kind: "single_plan",
      termId: null,
      quantity: 1,
      amount: "150.00",
      currency: "QAR",
      gateway: "tap",
      gatewayRef: null,
      status: "pending",
      createdAt: new Date(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gatewayResponse({
      id: "chg_test_1",
      status: "CAPTURED",
      amount: 150,
      currency: "QAR",
      reference: { order: "42" },
    })));

    const result = await postJson("/api/webhooks/tap", { id: "chg_test_1" });
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(mocks.activateVerifiedPurchase).toHaveBeenCalledWith(expect.objectContaining({
      gateway: "tap",
      gatewayRef: "chg_test_1",
      purchaseId: 42,
    }));
  });
});
