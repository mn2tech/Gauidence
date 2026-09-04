import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInboxMockMessages,
  filterInboxMessages,
  type InboxSpaceOption,
} from "../mockMail";

const SPACES: InboxSpaceOption[] = [
  { id: "personal", display_name: "Kola", profile_type: "personal" },
  { id: "nolan", display_name: "Nolan", profile_type: "child" },
  { id: "biz", display_name: "NM2TECH", profile_type: "business" },
];

describe("inbox mock filters", () => {
  it("binds school mail to child Space and bills to personal", () => {
    const messages = buildInboxMockMessages(SPACES);
    const school = messages.find((m) => m.id === "mock-mcps-1");
    assert.equal(school?.suggestedSpaceId, "nolan");
    assert.equal(school?.assignedSpaceId, null);

    const bill = messages.find((m) => m.id === "mock-bge");
    assert.equal(bill?.suggestedSpaceId, "personal");
    assert.equal(bill?.bucket, "bills");
  });

  it("filters by smart bucket and Space", () => {
    const messages = buildInboxMockMessages(SPACES);
    const bills = filterInboxMessages(messages, "bills");
    assert.ok(bills.every((m) => m.bucket === "bills"));
    assert.ok(bills.length >= 2);

    const school = filterInboxMessages(messages, "school");
    assert.ok(school.every((m) => m.bucket === "school"));

    const nolan = filterInboxMessages(messages, "space:nolan");
    assert.ok(nolan.some((m) => m.id === "mock-mcps-1"));
    assert.ok(
      nolan.every(
        (m) =>
          m.assignedSpaceId === "nolan" ||
          (m.assignedSpaceId == null && m.suggestedSpaceId === "nolan")
      )
    );
  });

  it("unsorted excludes filed threads", () => {
    const messages = buildInboxMockMessages(SPACES);
    const unsorted = filterInboxMessages(messages, "unsorted");
    assert.ok(unsorted.every((m) => m.assignedSpaceId == null));
    assert.ok(!unsorted.some((m) => m.id === "mock-chamber"));
  });
});
