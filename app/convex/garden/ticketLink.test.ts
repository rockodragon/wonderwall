import { describe, expect, it } from "vitest";
import { guestNamesFrom, isPayPalPaymentLink, isStripePaymentLink, nextTicketState, ticketCountFor } from "./ticketLink";

describe("isPayPalPaymentLink", () => {
  it("is PayPal's no-code pay link", () => {
    expect(isPayPalPaymentLink("https://www.paypal.com/ncp/payment/BVJYP3SUBYXWS")).toBe(true);
    expect(isPayPalPaymentLink("https://paypal.com/ncp/payment/BVJYP3SUBYXWS/")).toBe(true);
    expect(isPayPalPaymentLink(" https://www.paypal.com/ncp/payment/BVJYP3SUBYXWS ")).toBe(true);
  });
  it("is not any other PayPal page, a look-alike host, or plain http", () => {
    expect(isPayPalPaymentLink("https://www.paypal.com/donate/?hosted_button_id=X")).toBe(false);
    expect(isPayPalPaymentLink("https://www.paypal.me/someone")).toBe(false);
    expect(isPayPalPaymentLink("https://paypal.com.evil.example/ncp/payment/BVJYP3SUBYXWS")).toBe(false);
    expect(isPayPalPaymentLink("http://www.paypal.com/ncp/payment/BVJYP3SUBYXWS")).toBe(false);
    expect(isPayPalPaymentLink("https://www.paypal.com/ncp/payment/")).toBe(false);
    expect(isPayPalPaymentLink(undefined)).toBe(false);
  });
  it("never overlaps a Stripe link", () => {
    expect(isStripePaymentLink("https://www.paypal.com/ncp/payment/BVJYP3SUBYXWS")).toBe(false);
    expect(isPayPalPaymentLink("https://buy.stripe.com/test_abc")).toBe(false);
  });
});

describe("ticketCountFor", () => {
  it("divides the total by the ticket price", () => {
    expect(ticketCountFor(7500, 2500)).toBe(3);
    expect(ticketCountFor(2500, 2500)).toBe(1);
  });
  it("is at least 1, and 1 when there's no price to divide by", () => {
    expect(ticketCountFor(2500, undefined)).toBe(1);
    expect(ticketCountFor(0, 2500)).toBe(1);
  });
});

describe("guestNamesFrom", () => {
  it("takes the first filled text field, whatever its key", () => {
    expect(
      guestNamesFrom([
        { key: "x", type: "dropdown" },
        { key: "othernames", type: "text", text: { value: "  Ann, Ben " } },
      ]),
    ).toBe("Ann, Ben");
  });
  it("is null when the box was left empty or isn't there", () => {
    expect(guestNamesFrom([{ type: "text", text: { value: "  " } }])).toBeNull();
    expect(guestNamesFrom(undefined)).toBeNull();
  });
});

describe("nextTicketState", () => {
  it("a first purchase holds its own count", () => {
    expect(nextTicketState(null, { tickets: 3, guestNames: "Ann, Ben" })).toEqual({ ticketCount: 3, guestNames: "Ann, Ben" });
  });
  it("a second purchase adds tickets and names", () => {
    expect(
      nextTicketState({ ticketCount: 2, paidCents: 5000, guestNames: "Ann" }, { tickets: 1, guestNames: "Cy" }),
    ).toEqual({ ticketCount: 3, guestNames: "Ann; Cy" });
  });
  it("an older paid RSVP counts as one ticket; a free RSVP as none", () => {
    expect(nextTicketState({ paidCents: 2500 }, { tickets: 1, guestNames: null }).ticketCount).toBe(2);
    expect(nextTicketState({}, { tickets: 2, guestNames: null }).ticketCount).toBe(2);
  });
});
