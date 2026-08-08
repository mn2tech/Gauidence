import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDailyLogsForGideon } from "../retrieve.ts";
import {
  formatLogDayHeading,
  isValidLogDate,
  scoreLogRelevance,
  todayLogDate,
  type DailyLog,
} from "../types.ts";

describe("daily log helpers", () => {
  it("validates calendar dates", () => {
    assert.equal(isValidLogDate("2026-07-13"), true);
    assert.equal(isValidLogDate("2026-02-30"), false);
    assert.equal(isValidLogDate("07/13/2026"), false);
  });

  it("labels today and yesterday without shifting the calendar day", () => {
    const today = "2026-07-13";
    assert.match(formatLogDayHeading(today, today), /^Today —/);
    assert.match(formatLogDayHeading("2026-07-12", today), /^Yesterday —/);
  });

  it("scores relevant logs higher for keyword matches", () => {
    const log = {
      content: "Followed up with Onyx about Invoice #0000016",
      title: null,
      category: "Invoice",
      tags: ["Onyx"],
      log_date: todayLogDate(),
    };
    const hit = scoreLogRelevance(log, "What happened with Invoice #16?");
    const miss = scoreLogRelevance(log, "What is the weather like?");
    assert.ok(hit > miss);
  });

  it("boosts logs when content mentions a person named in the question", () => {
    const log = {
      content: "Aaron asked to remove John Marshall Bank from payroll.",
      title: null,
      category: "Client",
      tags: [],
      log_date: todayLogDate(),
    };
    const hit = scoreLogRelevance(
      log,
      "show the daily log that Aaron added",
      todayLogDate()
    );
    const miss = scoreLogRelevance(
      {
        ...log,
        content: "Payroll note for this week.",
      },
      "show the daily log that Aaron added",
      todayLogDate()
    );
    assert.ok(hit > miss);
  });

  it("boosts logs when the question names the author", () => {
    const log = {
      content: "Client needs updated W-9 before payroll.",
      title: null,
      category: "Client",
      tags: [],
      log_date: todayLogDate(),
    };
    const byAuthor = scoreLogRelevance(
      log,
      "show the daily log that Aaron added",
      todayLogDate(),
      { authorName: "Aaron Miller", vaultName: "crossroadconnect" }
    );
    const withoutAuthor = scoreLogRelevance(
      log,
      "show the daily log that Aaron added"
    );
    assert.ok(byAuthor > withoutAuthor);
  });

  it("boosts logs when the question names the vault", () => {
    const log = {
      content: "Payroll note for this week.",
      title: null,
      category: "Client",
      tags: [],
      log_date: todayLogDate(),
    };
    const byVault = scoreLogRelevance(
      log,
      "show crossroadconnect daily log",
      todayLogDate(),
      { vaultName: "crossroadconnect" }
    );
    const withoutVault = scoreLogRelevance(log, "show crossroadconnect daily log");
    assert.ok(byVault > withoutVault);
  });

  it("formats daily logs with vault and author labels", () => {
    const log: DailyLog = {
      id: "log-1",
      owner_user_id: "user-aaron",
      profile_id: "profile-client",
      log_date: "2026-08-02",
      title: null,
      content: "Uploaded signed agreement.",
      category: "Client",
      tags: [],
      source_type: "user_entered",
      created_at: "2026-08-02T12:00:00.000Z",
      updated_at: "2026-08-02T12:00:00.000Z",
    };
    const formatted = formatDailyLogsForGideon(
      [log],
      { "profile-client": "crossroadconnect" },
      { "user-aaron": "Aaron Miller" }
    );
    assert.match(formatted, /space: crossroadconnect/);
    assert.match(formatted, /added by: Aaron Miller/);
    assert.match(formatted, /Uploaded signed agreement\./);
  });
});
