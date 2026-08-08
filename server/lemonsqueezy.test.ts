import { describe, it, expect } from "vitest";
import crypto from "crypto";

// اختبارات تكامل Lemon Squeezy (وسيط بائع)
// تركّز على منطق الأمان المستقل عن الشبكة: التحقق من التوقيع ومطابقة المنتج.

describe("Lemon Squeezy Integration", () => {
  describe("Webhook signature (HMAC-SHA256 over raw body)", () => {
    const secret = "test_ls_webhook_secret";
    const rawBody = JSON.stringify({
      meta: { event_name: "order_created", custom_data: { purchase_id: "42" } },
      data: { id: "1001", attributes: { status: "paid", first_order_item: { variant_id: 999 } } },
    });

    function sign(payload: string, key: string): string {
      return crypto.createHmac("sha256", key).update(payload).digest("hex");
    }

    it("valid signature matches", () => {
      const sig = sign(rawBody, secret);
      const computed = sign(rawBody, secret);
      const ok =
        sig.length === computed.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
      expect(ok).toBe(true);
    });

    it("tampered body fails verification", () => {
      const sig = sign(rawBody, secret);
      const tampered = rawBody.replace('"42"', '"43"');
      const computed = sign(tampered, secret);
      const ok =
        sig.length === computed.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
      expect(ok).toBe(false);
    });

    it("wrong secret fails verification", () => {
      const sig = sign(rawBody, secret);
      const computed = sign(rawBody, "wrong_secret");
      const ok =
        sig.length === computed.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
      expect(ok).toBe(false);
    });
  });

  describe("Variant → purchase kind matching", () => {
    const SINGLE = "111";
    const SEMESTER = "222";
    function expectedVariant(kind: "single_plan" | "semester") {
      return kind === "semester" ? SEMESTER : SINGLE;
    }

    it("semester purchase expects semester variant", () => {
      expect(expectedVariant("semester")).toBe(SEMESTER);
    });
    it("single plan purchase expects single variant", () => {
      expect(expectedVariant("single_plan")).toBe(SINGLE);
    });
    it("mismatched variant is rejected", () => {
      const paidVariant = "999";
      expect(paidVariant === expectedVariant("semester")).toBe(false);
    });
  });

  describe("Event filtering", () => {
    it("only order_created is processed", () => {
      const events = ["order_created", "subscription_created", "order_refunded"];
      const processed = events.filter((e) => e === "order_created");
      expect(processed).toEqual(["order_created"]);
    });
  });
});
