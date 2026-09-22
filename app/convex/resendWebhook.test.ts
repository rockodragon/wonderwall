// Pure-logic tests for the Resend delivery-event webhook. No Convex, no
// network — an in-memory fake Db + hand-written fixture events shaped like
// real Resend payloads, and Node's `crypto` to compute expected Svix
// signatures independently of the code under test.

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  handleResendEvent,
  verifySvixSignature,
  type DeliveryStatusRow,
  type ResendWebhookDb,
  type ResendWebhookEvent,
} from "./resendWebhook";

function createFakeDb() {
  const deliveries = new Map<string, DeliveryStatusRow & { detail?: string; lastEventAt?: number }>();
  const suppressions: Array<{ email: string; reason: "bounced" | "complained"; providerId?: string }> = [];

  const db: ResendWebhookDb = {
    async getDelivery(providerId) {
      const row = deliveries.get(providerId);
      return row ? { providerId: row.providerId, status: row.status } : null;
    },
    async updateDelivery(providerId, patch) {
      const existing = deliveries.get(providerId);
      if (!existing) return { unknown: true };
      deliveries.set(providerId, { ...existing, ...patch });
      return { unknown: false };
    },
    async addSuppression(row) {
      suppressions.push(row);
    },
  };

  return {
    db,
    deliveries,
    suppressions,
    seed(providerId: string, status: DeliveryStatusRow["status"] = "sent") {
      deliveries.set(providerId, { providerId, status });
    },
  };
}

const NOW = 1_700_000_000_000;

describe("handleResendEvent", () => {
  it("email.sent sets status to sent", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.sent",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "sent" });
    expect(fake.deliveries.get("em_1")?.status).toBe("sent");
  });

  it("email.sent does not regress a later status", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "bounced");

    const event: ResendWebhookEvent = {
      type: "email.sent",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "bounced" });
    expect(fake.deliveries.get("em_1")?.status).toBe("bounced");
  });

  it("email.delivered sets status to delivered", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.delivered",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "delivered" });
    expect(fake.deliveries.get("em_1")?.status).toBe("delivered");
  });

  it("email.delivery_delayed sets status to delayed", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.delivery_delayed",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "delayed" });
  });

  it("email.bounced with a Permanent bounce sets status and suppresses the recipient(s)", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.bounced",
      data: {
        email_id: "em_1",
        to: ["A@Example.com", "b@example.com"],
        bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" },
      },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "bounced" });
    expect(fake.deliveries.get("em_1")?.detail).toBe("Mailbox does not exist");
    expect(fake.suppressions).toEqual([
      { email: "a@example.com", reason: "bounced", providerId: "em_1" },
      { email: "b@example.com", reason: "bounced", providerId: "em_1" },
    ]);
  });

  it("email.bounced with a Transient bounce records the status but does not suppress", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.bounced",
      data: {
        email_id: "em_1",
        to: ["a@example.com"],
        bounce: { type: "Transient", subType: "MailboxFull", message: "Mailbox full" },
      },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "bounced" });
    expect(fake.deliveries.get("em_1")?.detail).toBe("Mailbox full");
    expect(fake.suppressions).toEqual([]);
  });

  it("email.bounced with no bounce detail still records the status", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.bounced",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "bounced" });
    expect(fake.deliveries.get("em_1")?.detail).toBeUndefined();
    expect(fake.suppressions).toEqual([]);
  });

  it("email.complained sets status and suppresses every recipient", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "delivered");

    const event: ResendWebhookEvent = {
      type: "email.complained",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ok: true, status: "complained" });
    expect(fake.suppressions).toEqual([{ email: "a@example.com", reason: "complained", providerId: "em_1" }]);
  });

  it("unknown email_id returns {unknown: true} without throwing", async () => {
    const fake = createFakeDb();

    const event: ResendWebhookEvent = {
      type: "email.delivered",
      data: { email_id: "em_missing", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ unknown: true });
  });

  it("unknown event type is ignored", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.opened",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ignored: true });
  });

  it("email.clicked is ignored", async () => {
    const fake = createFakeDb();
    fake.seed("em_1", "sent");

    const event: ResendWebhookEvent = {
      type: "email.clicked",
      data: { email_id: "em_1", to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ignored: true });
  });

  it("a recognized type with no email_id is ignored rather than throwing", async () => {
    const fake = createFakeDb();

    const event: ResendWebhookEvent = {
      type: "email.delivered",
      data: { to: ["a@example.com"] },
    };
    const result = await handleResendEvent(event, fake.db, NOW);
    expect(result).toEqual({ ignored: true });
  });
});

// ——— Signature verification ———

const SECRET = "whsec_" + Buffer.from("supersecretsupersecretsupersecret").toString("base64");

function computeSvixSignature(secret: string, svixId: string, svixTimestamp: string, body: string): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const sig = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${sig}`;
}

describe("verifySvixSignature", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "em_1", to: ["a@example.com"] } });

  it("accepts a valid signature", async () => {
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(NOW / 1000));
    const signature = computeSvixSignature(SECRET, svixId, svixTimestamp, body);

    const ok = await verifySvixSignature(
      SECRET,
      { svixId, svixTimestamp, svixSignature: signature },
      body,
      NOW,
    );
    expect(ok).toBe(true);
  });

  it("accepts a valid signature among multiple space-separated candidates (key rotation)", async () => {
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(NOW / 1000));
    const signature = computeSvixSignature(SECRET, svixId, svixTimestamp, body);

    const ok = await verifySvixSignature(
      SECRET,
      { svixId, svixTimestamp, svixSignature: `v1,bogus== ${signature}` },
      body,
      NOW,
    );
    expect(ok).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(NOW / 1000));
    const wrongSecret = "whsec_" + Buffer.from("totallydifferentsecretvaluevalue").toString("base64");
    const signature = computeSvixSignature(wrongSecret, svixId, svixTimestamp, body);

    const ok = await verifySvixSignature(
      SECRET,
      { svixId, svixTimestamp, svixSignature: signature },
      body,
      NOW,
    );
    expect(ok).toBe(false);
  });

  it("rejects a tampered body", async () => {
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(NOW / 1000));
    const signature = computeSvixSignature(SECRET, svixId, svixTimestamp, body);

    const ok = await verifySvixSignature(
      SECRET,
      { svixId, svixTimestamp, svixSignature: signature },
      body + "tampered",
      NOW,
    );
    expect(ok).toBe(false);
  });

  it("rejects a stale timestamp (more than 5 minutes off)", async () => {
    const svixId = "msg_1";
    const staleTimestamp = String(Math.floor(NOW / 1000) - 6 * 60);
    const signature = computeSvixSignature(SECRET, svixId, staleTimestamp, body);

    const ok = await verifySvixSignature(
      SECRET,
      { svixId, svixTimestamp: staleTimestamp, svixSignature: signature },
      body,
      NOW,
    );
    expect(ok).toBe(false);
  });

  it("rejects missing headers", async () => {
    const ok = await verifySvixSignature(
      SECRET,
      { svixId: null, svixTimestamp: null, svixSignature: null },
      body,
      NOW,
    );
    expect(ok).toBe(false);
  });
});
