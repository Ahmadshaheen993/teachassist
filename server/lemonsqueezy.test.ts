import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { paymentWebhooks, PAYMENT_GATEWAYS } from "./payments";
import * as db from "./db";
import * as paymentFuncs from "./db-payment-functions";

vi.mock("./db", () => ({ getPurchaseById: vi.fn(), getDb: vi.fn() }));
vi.mock("./db-payment-functions", () => ({
  activatePurchaseTransaction: vi.fn(),
  isWebhookProcessed: vi.fn(),
  recordWebhookEvent: vi.fn(),
  logPaymentAudit: vi.fn(),
}));

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  // Match production routing: callbacks precede the general JSON parser.
  app.use("/api/webhooks", paymentWebhooks);
  app.use(express.json());
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe("Payment webhook quarantine", () => {
  for (const gateway of PAYMENT_GATEWAYS) {
    it.each(["false", "true"])("returns retryable 503 for " + gateway + " without grants when flag=%s", async (flag) => {
      vi.stubEnv("PAYMENTS_ENABLED", flag);
      const body = JSON.stringify({
        meta: { event_name: "order_created", custom_data: { purchase_id: "42" } },
        data: { id: "1001", attributes: { status: "paid", test_mode: false, store_id: 1, first_order_item: { variant_id: 2 } } },
        id: "chg_test", status: "CAPTURED", reference: { order: "42" },
        Data: { InvoiceId: 1, CustomerReference: "42", InvoiceValue: 10, DisplayCurrencyIso: "QAR" },
        currency: "QAR", amount: 10,
      });
      const signature = createHmac("sha256", "signed_test_secret").update(body).digest("hex");
      vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "signed_test_secret");
      const response = await fetch(`${origin}/api/webhooks/${gateway}`, {
        method: "POST", headers: { "content-type": "application/json", "x-signature": signature }, body,
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("300");
      expect(await response.json()).toEqual({ error: "PAYMENT_PROVIDER_UNAVAILABLE" });
      expect(db.getPurchaseById).not.toHaveBeenCalled();
      expect(db.getDb).not.toHaveBeenCalled();
      expect(paymentFuncs.activatePurchaseTransaction).not.toHaveBeenCalled();
      expect(paymentFuncs.recordWebhookEvent).not.toHaveBeenCalled();
      expect(paymentFuncs.isWebhookProcessed).not.toHaveBeenCalled();
    });
  }

  it("does not acknowledge a malformed body as processed", async () => {
    const response = await fetch(`${origin}/api/webhooks/lemonsqueezy`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{broken",
    });
    expect(response.status).toBe(503);
    expect(paymentFuncs.activatePurchaseTransaction).not.toHaveBeenCalled();
  });
});
