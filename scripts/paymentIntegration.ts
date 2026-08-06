import assert from "node:assert/strict";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import {
  createConnection,
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

type FakeCharge = {
  id: string;
  status: "CAPTURED" | "INITIATED";
  amount: number;
  currency: string;
  reference: { order: string };
};

const charges = new Map<string, FakeCharge>();
const checkoutRequests: Array<Record<string, unknown>> = [];
let checkoutCounter = 0;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) body += String(chunk);
  return body ? JSON.parse(body) as Record<string, unknown> : {};
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return (server.address() as AddressInfo).port;
}

async function close(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function one<T extends RowDataPacket>(
  connection: Connection,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const [rows] = await connection.execute<T[]>(sql, params);
  assert.ok(rows[0], `Expected one row for: ${sql}`);
  return rows[0];
}

async function seedCountry(
  connection: Connection,
  code: string,
  pricePerPlan = "10.00",
): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO countries
      (code, nameAr, currencyCode, pricePerPlan, pricePerSemester, isActive)
     VALUES (?, ?, 'QAR', ?, '150.00', TRUE)
     ON DUPLICATE KEY UPDATE
       id=LAST_INSERT_ID(id), currencyCode='QAR', pricePerPlan=VALUES(pricePerPlan), isActive=TRUE`,
    [code, `CI ${code}`, pricePerPlan],
  );
  return result.insertId;
}

let userCounter = 0;
async function seedUser(connection: Connection, countryId: number): Promise<RowDataPacket> {
  userCounter += 1;
  const suffix = `${Date.now()}-${userCounter}`;
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO users (openId, name, email, loginMethod, role, countryId)
     VALUES (?, 'Payment CI', ?, 'local', 'user', ?)`,
    [`payment-ci-${suffix}`, `payment-ci-${suffix}@example.com`, countryId],
  );
  return one<RowDataPacket>(connection, "SELECT * FROM users WHERE id=?", [result.insertId]);
}

async function seedPurchase(
  connection: Connection,
  userId: number,
  countryId: number,
  quantity = 1,
): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO purchases
      (userId, countryId, kind, quantity, amount, currency, gateway, status)
     VALUES (?, ?, 'single_plan', ?, '10.00', 'QAR', 'tap', 'pending')`,
    [userId, countryId, quantity],
  );
  return result.insertId;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");

  const fakeProvider = http.createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/v2/charges") {
        const body = await readJson(req);
        checkoutRequests.push(body);
        checkoutCounter += 1;
        return sendJson(res, 200, {
          id: `chg_checkout_${checkoutCounter}`,
          transaction: { url: `http://127.0.0.1/pay/checkout-${checkoutCounter}` },
        });
      }

      const match = /^\/v2\/charges\/([^/?]+)$/.exec(req.url ?? "");
      if (req.method === "GET" && match) {
        const charge = charges.get(decodeURIComponent(match[1]));
        return charge
          ? sendJson(res, 200, charge)
          : sendJson(res, 404, { error: "not_found" });
      }
      return sendJson(res, 404, { error: "not_found" });
    } catch {
      return sendJson(res, 400, { error: "invalid_request" });
    }
  });

  let appServer: Server | undefined;
  let connection: Connection | undefined;
  try {
    const providerPort = await listen(fakeProvider);
    process.env.NODE_ENV = "test";
    process.env.PAYMENTS_ENABLED = "true";
    process.env.TAP_BASE_URL = `http://127.0.0.1:${providerPort}`;
    process.env.TAP_SECRET_KEY = "ci-only-test-key";
    process.env.APP_BASE_URL = "http://127.0.0.1:9999";
    process.env.PAYMENT_HTTP_TIMEOUT_MS = "2000";
    process.env.JWT_SECRET = "ci-only-session-secret";
    process.env.VITE_APP_ID = "local";
    process.env.OAUTH_SERVER_URL = "http://127.0.0.1";

    const [{ paymentWebhooks }, { appRouter }, rateLimiter] = await Promise.all([
      import("../server/payments"),
      import("../server/routers"),
      import("../server/rateLimiter"),
    ]);

    const app = express();
    app.use(express.json({ limit: "64kb" }));
    app.use("/api/webhooks", paymentWebhooks);
    appServer = http.createServer(app);
    const appPort = await listen(appServer);
    connection = await createConnection(databaseUrl);

    const runId = Date.now().toString().slice(-3);
    const planCountryId = await seedCountry(connection, `P${runId}`);
    const noTermCountryId = await seedCountry(connection, `N${runId}`);

    const callerFor = (user: RowDataPacket, ip: string) => appRouter.createCaller({
      user: user as any,
      req: { ip, socket: { remoteAddress: ip } } as any,
      res: {} as any,
    });

    const purchaseCount = async (userId: number) => Number((await one<RowDataPacket>(
      connection!,
      "SELECT COUNT(*) AS count FROM purchases WHERE userId=?",
      [userId],
    )).count);

    const creditBalance = async (userId: number) => Number((await one<RowDataPacket>(
      connection!,
      "SELECT COALESCE(MAX(balance), 0) AS balance FROM plan_credits WHERE userId=?",
      [userId],
    )).balance);

    const postWebhook = async (id: string) => {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/webhooks/tap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      return { status: response.status, body: await response.json() as any };
    };

    // 1. Kill switch fails closed and creates no purchase.
    {
      const user = await seedUser(connection, planCountryId);
      const caller = callerFor(user, "203.0.113.10");
      process.env.PAYMENTS_ENABLED = "false";
      let error: any;
      try { await caller.subscription.buyPlan({ gateway: "tap" }); } catch (caught) { error = caught; }
      assert.equal(error?.code, "SERVICE_UNAVAILABLE");
      assert.equal(await purchaseCount(Number(user.id)), 0);
      process.env.PAYMENTS_ENABLED = "true";
      console.log("✓ payment kill switch fails closed");
    }

    // 2. A semester cannot be sold without a valid configured term.
    {
      rateLimiter.resetRateLimitStoreForTests();
      const user = await seedUser(connection, noTermCountryId);
      const result = await callerFor(user, "203.0.113.11")
        .subscription.buySemester({ gateway: "tap" });
      assert.equal(result.success, false);
      assert.match((result as any).error ?? "", /لا يوجد فصل دراسي صالح/);
      assert.equal(await purchaseCount(Number(user.id)), 0);
      console.log("✓ missing semester is rejected before checkout");
    }

    // 3. Client-supplied price/currency fields are ignored; canonical DB values reach Tap.
    {
      rateLimiter.resetRateLimitStoreForTests();
      const user = await seedUser(connection, planCountryId);
      const result = await callerFor(user, "203.0.113.12").subscription.buyPlan({
        gateway: "tap",
        amount: 0.01,
        currency: "USD",
      } as any);
      assert.equal(result.success, true);
      const purchase = await one<RowDataPacket>(
        connection,
        "SELECT amount, currency, status FROM purchases WHERE userId=? ORDER BY id DESC LIMIT 1",
        [user.id],
      );
      assert.equal(String(purchase.amount), "10.00");
      assert.equal(purchase.currency, "QAR");
      assert.equal(purchase.status, "pending");
      const providerBody = checkoutRequests.at(-1)!;
      assert.equal(Number(providerBody.amount), 10);
      assert.equal(providerBody.currency, "QAR");
      console.log("✓ client price/currency tampering is ignored");
    }

    // 4. The sixth buyPlan request is blocked and does not create a sixth purchase.
    {
      rateLimiter.resetRateLimitStoreForTests();
      const user = await seedUser(connection, planCountryId);
      const caller = callerFor(user, "203.0.113.13");
      for (let index = 0; index < 5; index += 1) {
        const result = await caller.subscription.buyPlan({ gateway: "tap" });
        assert.equal(result.success, true);
      }
      let error: any;
      try { await caller.subscription.buyPlan({ gateway: "tap" }); } catch (caught) { error = caught; }
      assert.equal(error?.code, "TOO_MANY_REQUESTS");
      assert.equal(await purchaseCount(Number(user.id)), 5);
      console.log("✓ buyPlan rate limit blocks request six");
    }

    // 5. A provider currency mismatch leaves the purchase pending and grants nothing.
    {
      const user = await seedUser(connection, planCountryId);
      const purchaseId = await seedPurchase(connection, Number(user.id), planCountryId);
      const id = `chg_currency_${purchaseId}`;
      charges.set(id, {
        id, status: "CAPTURED", amount: 10, currency: "USD",
        reference: { order: String(purchaseId) },
      });
      const response = await postWebhook(id);
      assert.equal(response.status, 200);
      assert.equal(response.body.ok, false);
      const purchase = await one<RowDataPacket>(connection, "SELECT status, gatewayRef FROM purchases WHERE id=?", [purchaseId]);
      assert.equal(purchase.status, "pending");
      assert.equal(purchase.gatewayRef, null);
      assert.equal(await creditBalance(Number(user.id)), 0);
      const audit = await one<RowDataPacket>(
        connection,
        "SELECT status, errorCode FROM payment_audit_logs WHERE purchaseId=? ORDER BY id DESC LIMIT 1",
        [purchaseId],
      );
      assert.equal(audit.status, "mismatch");
      assert.equal(audit.errorCode, "AMOUNT_OR_CURRENCY_MISMATCH");
      console.log("✓ provider currency mismatch grants no entitlement");
    }

    // 6. A valid captured charge grants exactly once; a duplicate webhook is idempotent.
    {
      const user = await seedUser(connection, planCountryId);
      const purchaseId = await seedPurchase(connection, Number(user.id), planCountryId);
      const id = `chg_success_${purchaseId}`;
      charges.set(id, {
        id, status: "CAPTURED", amount: 10, currency: "QAR",
        reference: { order: String(purchaseId) },
      });
      const first = await postWebhook(id);
      const duplicate = await postWebhook(id);
      assert.equal(first.status, 200);
      assert.equal(first.body.ok, true);
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.ok, true);
      assert.equal(await creditBalance(Number(user.id)), 1);
      const purchase = await one<RowDataPacket>(connection, "SELECT status, gatewayRef FROM purchases WHERE id=?", [purchaseId]);
      assert.equal(purchase.status, "paid");
      assert.equal(purchase.gatewayRef, id);
      const events = await one<RowDataPacket>(
        connection,
        "SELECT COUNT(*) AS count FROM payment_webhook_events WHERE gateway='tap' AND eventId=?",
        [id],
      );
      assert.equal(Number(events.count), 1);
      console.log("✓ duplicate webhook grants exactly once");
    }

    // 7. Two concurrent callbacks serialize and grant exactly once.
    {
      const user = await seedUser(connection, planCountryId);
      const purchaseId = await seedPurchase(connection, Number(user.id), planCountryId);
      const id = `chg_concurrent_${purchaseId}`;
      charges.set(id, {
        id, status: "CAPTURED", amount: 10, currency: "QAR",
        reference: { order: String(purchaseId) },
      });
      const [a, b] = await Promise.all([postWebhook(id), postWebhook(id)]);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(a.body.ok, true);
      assert.equal(b.body.ok, true);
      assert.equal(await creditBalance(Number(user.id)), 1);
      const events = await one<RowDataPacket>(
        connection,
        "SELECT COUNT(*) AS count FROM payment_webhook_events WHERE gateway='tap' AND eventId=?",
        [id],
      );
      assert.equal(Number(events.count), 1);
      console.log("✓ concurrent callbacks grant exactly once");
    }

    // 8. Entitlement failure rolls back the event and leaves the purchase pending.
    {
      const user = await seedUser(connection, planCountryId);
      const purchaseId = await seedPurchase(connection, Number(user.id), planCountryId, 0);
      const id = `chg_rollback_${purchaseId}`;
      charges.set(id, {
        id, status: "CAPTURED", amount: 10, currency: "QAR",
        reference: { order: String(purchaseId) },
      });
      const response = await postWebhook(id);
      assert.equal(response.status, 500);
      const purchase = await one<RowDataPacket>(connection, "SELECT status, gatewayRef FROM purchases WHERE id=?", [purchaseId]);
      assert.equal(purchase.status, "pending");
      assert.equal(purchase.gatewayRef, null);
      assert.equal(await creditBalance(Number(user.id)), 0);
      const events = await one<RowDataPacket>(
        connection,
        "SELECT COUNT(*) AS count FROM payment_webhook_events WHERE gateway='tap' AND eventId=?",
        [id],
      );
      assert.equal(Number(events.count), 0);
      console.log("✓ entitlement failure rolls back purchase activation");
    }

    console.log("Payment integration tests passed: 8/8");
  } finally {
    if (connection) await connection.end();
    await close(appServer);
    await close(fakeProvider);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Payment integration tests failed", error);
    process.exit(1);
  });
