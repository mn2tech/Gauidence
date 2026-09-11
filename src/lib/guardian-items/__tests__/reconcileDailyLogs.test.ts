import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileItemWithDailyLogs } from "../reconcileDailyLogs";

const permissionItem = {
  type: "document_requirement" as const,
  title: "Respond to permission request for child's resource program",
  description: "Permission is needed before the resource program starts.",
  event_date: "2026-09-14",
  due_at: "2026-09-14",
  requires_action: true,
  priority: "high" as const,
  child_reference: "Nolan",
  confidence: 0.96,
  source_excerpt: "give permission for us to start Monday",
};

describe("cross-source Daily Log reconciliation", () => {
  it("completes the permission request and derives the remaining reply follow-up", () => {
    const result = reconcileItemWithDailyLogs(permissionItem, [
      {
        id: "log-1",
        title: "Reply to Ms. Sellner",
        log_date: "2026-09-11",
        content:
          "Dear Ms. Sellner, We're happy to give permission for Nolan to participate in the Language Resource program starting Monday. Could you please share what specific skills or areas you've noticed that would benefit from this extra support? Best regards, Michael Kola",
      },
    ]);

    assert.equal(result.completedBy?.id, "log-1");
    assert.equal(result.followUp?.type, "follow_up");
    assert.equal(result.followUp?.title, "Watch for Ms. Sellner's reply");
    assert.match(result.followUp?.description ?? "", /specific skills/i);
  });

  it("does not complete an item from a related note without completion evidence", () => {
    const result = reconcileItemWithDailyLogs(permissionItem, [
      {
        id: "log-2",
        title: "Resource program",
        log_date: "2026-09-11",
        content: "Need to decide whether to give permission for Nolan's resource program.",
      },
    ]);
    assert.equal(result.completedBy, null);
    assert.equal(result.followUp, null);
  });

  it("does not match an unrelated completed action", () => {
    const result = reconcileItemWithDailyLogs(permissionItem, [
      {
        id: "log-3",
        title: "Invoice",
        log_date: "2026-09-11",
        content: "I already sent the August invoice to Onyx for payment.",
      },
    ]);
    assert.equal(result.completedBy, null);
  });
});

