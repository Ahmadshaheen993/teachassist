import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  paymentAuditLogs,
  paymentWebhookEvents,
  planCredits,
  purchases,
  subscriptions,
  terms,
  users,
} from "../drizzle/schema";

type FakeState = {
  purchase: any;
  user: any;
  term: any;
  event: any | null;
  creditBalance: number;
  subscription: any | null;
  audit: any[];
  failOnPurchaseUpdate: boolean;
};

const harness = vi.hoisted(() => {
  process.env.DATABASE_URL = "mysql://payment-test.invalid/test";
  return {
    state: {} as FakeState,
    transactionTail: Promise.resolve() as Promise<unknown>,
  };
});

function rowsFor(table: unknown): any[] {
  if (table === paymentWebhookEvents) return harness.state.event ? [harness.state.event] : [];
  if (table === purchases) return harness.state.purchase ? [harness.state.purchase] : [];
  if (table === users) return harness.state.user ? [harness.state.user] : [];
  if (table === terms) return harness.state.term ? [harness.state.term] : [];
  return [];
}

function selectQuery(table: unknown) {
  const query: any = {
    where: () => query,
    limit: () => query,
    for: async () => rowsFor(table),
    then: (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rowsFor(table)).then(resolve, reject),
  };
  return query;
}

function insertQuery(table: unknown, values: any) {
  let executed = false;
  const execute = async () => {
    if (executed) return;
    executed = true;
    if (table === paymentWebhookEvents) {
      harness.state.event ??= { id: 1, processedAt: new Date(), ...values };
    } else if (table === planCredits) {
      harness.state.creditBalance += values.balance;
    } else if (table === subscriptions) {
      harness.state.subscription ??= { id: 1, createdAt: new Date(), ...values };
    } else if (table === paymentAuditLogs) {
      harness.state.audit.push(values);
    }
  };
  const query: any = {
    onDuplicateKeyUpdate: async () => execute(),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      execute().then(resolve, reject),
  };
  return query;
}

const fakeDb = {
  transaction: async (callback: (tx: any) => Promise<unknown>) => {
    const run = harness.transactionTail.then(async () => {
      const snapshot = structuredClone(harness.state);
      const tx = {
        insert: (table: unknown) => ({
          values: (values: any) => insertQuery(table, values),
        }),
        select: () => ({
          from: (table: unknown) => selectQuery(table),
        }),
        update: (table: unknown) => ({
          set: (values: any) => ({
            where: async () => {
              if (table === purchases) {
                if (harness.state.failOnPurchaseUpdate) throw new Error("forced update failure");
                Object.assign(harness.state.purchase, values);
              }
            },
          }),
        }),
      };
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(harness.state, snapshot);
        throw error;
      }
    });
    harness.transactionTail = run.catch(() => undefined);
    return run;
  },
};

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => fakeDb,
}));

import { activateVerifiedPurchase } from "./db";

const activationInput = {
  purchaseId: 42,
  gateway: "tap" as const,
  gatewayRef: "chg_atomic_1",
  eventId: "chg_atomic_1",
  payloadHash: "a".repeat(64),
};

beforeEach(() => {
  harness.state.purchase = {
    id: 42,
    userId: 7,
    countryId: 1,
    kind: "single_plan",
    termId: null,
    quantity: 1,
    amount: "10.00",
    currency: "QAR",
    gateway: "tap",
    gatewayRef: null,
    status: "pending",
    createdAt: new Date(),
  };
  harness.state.user = { id: 7, countryId: 1 };
  harness.state.term = null;
  harness.state.event = null;
  harness.state.creditBalance = 0;
  harness.state.subscription = null;
  harness.state.audit = [];
  harness.state.failOnPurchaseUpdate = false;
  harness.transactionTail = Promise.resolve();
});

describe("atomic payment activation", () => {
  it("grants a concurrent duplicate webhook exactly once", async () => {
    const [first, second] = await Promise.all([
      activateVerifiedPurchase(activationInput),
      activateVerifiedPurchase(activationInput),
    ]);

    expect([first.outcome, second.outcome].sort()).toEqual(["activated", "already_activated"]);
    expect(harness.state.creditBalance).toBe(1);
    expect(harness.state.purchase.status).toBe("paid");
    expect(harness.state.audit.filter((entry) => entry.status === "success")).toHaveLength(1);
  });

  it("rolls entitlement and webhook reservation back when paid status cannot be committed", async () => {
    harness.state.failOnPurchaseUpdate = true;

    await expect(activateVerifiedPurchase(activationInput)).rejects.toThrow("forced update failure");
    expect(harness.state.purchase.status).toBe("pending");
    expect(harness.state.purchase.gatewayRef).toBeNull();
    expect(harness.state.creditBalance).toBe(0);
    expect(harness.state.event).toBeNull();
    expect(harness.state.audit).toHaveLength(0);
  });
});
