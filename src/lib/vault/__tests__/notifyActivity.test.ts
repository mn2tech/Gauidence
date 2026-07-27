import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderVaultActivityEmail } from "@/lib/email";
import {
  dailyLogActivityLabel,
  filterActivityEmailRecipients,
  formatVaultActivityVaultName,
  pickVaultActivityRecipients,
  truncateActivityPreview,
} from "@/lib/vault/notifyActivity";

describe("pickVaultActivityRecipients", () => {
  it("returns empty when only one member", () => {
    assert.deepEqual(pickVaultActivityRecipients(["a"], "a"), []);
  });

  it("excludes the actor", () => {
    assert.deepEqual(
      pickVaultActivityRecipients(["a", "b", "c"], "b"),
      ["a", "c"]
    );
  });
});

describe("filterActivityEmailRecipients", () => {
  it("drops users who opted out or have no email", () => {
    const recipients = [
      { userId: "a", email: "a@example.com" },
      { userId: "b", email: "b@example.com" },
      { userId: "c", email: "" },
    ];
    const prefs = new Map<string, boolean | null | undefined>([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
    const out = filterActivityEmailRecipients(recipients, prefs);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.userId, "a");
  });
});

describe("truncateActivityPreview", () => {
  it("shortens long text", () => {
    const long = "a".repeat(400);
    const out = truncateActivityPreview(long, 50);
    assert.ok(out.length <= 50);
    assert.ok(out.endsWith("…"));
  });
});

describe("dailyLogActivityLabel", () => {
  it("prefers title", () => {
    assert.equal(
      dailyLogActivityLabel("Wed practice", "body"),
      "Wed practice"
    );
  });

  it("falls back to first line of content", () => {
    assert.equal(
      dailyLogActivityLabel(null, "First line\nSecond line"),
      "First line"
    );
  });
});

describe("formatVaultActivityVaultName", () => {
  it("combines nested vault with parent", () => {
    assert.equal(
      formatVaultActivityVaultName("Crossroads", "NM2TECH - Next Move"),
      "Crossroads · NM2TECH - Next Move"
    );
  });

  it("uses vault name alone when no parent", () => {
    assert.equal(formatVaultActivityVaultName("NM2TECH - Next Move"), "NM2TECH - Next Move");
  });

  it("skips duplicate parent label", () => {
    assert.equal(
      formatVaultActivityVaultName("Acme", "Acme"),
      "Acme"
    );
  });
});

describe("renderVaultActivityEmail", () => {
  it("includes vault and item details", () => {
    const { subject, text } = renderVaultActivityEmail({
      to: "member@example.com",
      vaultName: "Wednesday Practice",
      actorName: "Alex",
      kind: "document",
      itemLabel: "Setlist.pdf",
      openUrl: "https://example.com/dashboard",
    });
    assert.match(subject, /Alex/);
    assert.match(subject, /Wednesday Practice/);
    assert.match(text, /Setlist\.pdf/);
  });
});
