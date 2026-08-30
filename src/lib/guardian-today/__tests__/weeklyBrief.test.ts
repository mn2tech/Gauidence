import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderWeeklyBriefEmail } from "@/lib/email";

describe("weekly brief email", () => {
  it("renders coming up and what changed sections", () => {
    const { subject, html, text } = renderWeeklyBriefEmail({
      to: "user@example.com",
      greetName: "Kola",
      comingUp: [
        {
          title: "Government Contracting Summit",
          detail: "Mon, Sep 1 · 3 days",
          url: "https://example.com/home",
        },
      ],
      whatChanged: [
        {
          title: "Onyx option year",
          detail: "Updated this week",
          url: "https://example.com/home",
        },
      ],
      caughtCount: 2,
      homeUrl: "https://example.com/home",
    });

    assert.match(subject, /Weekly Brief/i);
    assert.match(html, /Hi Kola/);
    assert.match(html, /Government Contracting Summit/);
    assert.match(html, /Coming up/i);
    assert.match(html, /What changed/i);
    assert.match(text, /Open Today's priorities/);
  });
});
