import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeMoneyEmail,
  compareWithPreviousCharge,
  moneySignalToGuardianItem,
} from "../moneySignals";

describe("Gmail Money Guardian", () => {
  it("detects a bill amount and due date", () => {
    const signal = analyzeMoneyEmail({
      fromName: "BGE",
      fromEmail: "billing@bge.com",
      subject: "Your bill is ready",
      preview: "Amount due $184.22. Payment due September 20, 2026.",
      receivedAt: "2026-09-14T12:00:00.000Z",
    });
    assert.equal(signal?.kind, "bill");
    assert.equal(signal?.amountCents, 18422);
    assert.equal(signal?.dueDate, "2026-09-20");
    assert.equal(moneySignalToGuardianItem(signal!, "bill")?.type, "payment");
  });

  it("detects an explicit monthly price increase and annualizes the delta", () => {
    const signal = analyzeMoneyEmail({
      fromName: "StreamCo",
      fromEmail: "billing@stream.example",
      subject: "Your monthly subscription price is changing",
      preview: "Your monthly price will increase from $15.00 to $18.00.",
      receivedAt: "2026-09-14T12:00:00.000Z",
    });
    assert.equal(signal?.kind, "price_increase");
    assert.equal(signal?.potentialAnnualSavingsCents, 3600);
  });

  it("confirms a price increase from a prior charge", () => {
    const current = analyzeMoneyEmail({
      fromName: "Internet Co",
      fromEmail: "bill@internet.example",
      subject: "Monthly bill",
      preview: "Amount due $78.00",
      receivedAt: "2026-09-14T12:00:00.000Z",
    })!;
    const previous = { ...current, amountCents: 60_00 };
    const compared = compareWithPreviousCharge(current, previous);
    assert.equal(compared.kind, "price_increase");
    assert.equal(compared.previousAmountCents, 60_00);
  });

  it("detects a return deadline but ignores ordinary mail", () => {
    const signal = analyzeMoneyEmail({
      fromName: "Shop",
      fromEmail: "orders@shop.example",
      subject: "Your order",
      preview: "Return by 10/02/2026 for a refund.",
      receivedAt: "2026-09-14T12:00:00.000Z",
    });
    assert.equal(signal?.kind, "return_deadline");
    assert.equal(signal?.dueDate, "2026-10-02");
    assert.equal(
      analyzeMoneyEmail({
        fromName: "Friend", fromEmail: "friend@example.com",
        subject: "Lunch", preview: "See you tomorrow", receivedAt: null,
      }),
      null
    );
  });
});
