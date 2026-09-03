import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTimesheetHoursQuery,
  parseTimesheetRemoteQuery,
  wantsTimesheetHoursQuery,
} from "../parse";
import {
  formatTimesheetHoursAnswer,
  formatTimesheetPeriodAnswer,
} from "../format";

describe("timesheet-remote parse", () => {
  it("detects English hours questions", () => {
    assert.equal(
      wantsTimesheetHoursQuery(
        "How many hours did Frank Damico work in May 2026?"
      ),
      true
    );
    assert.equal(wantsTimesheetHoursQuery("What is the weather?"), false);
  });

  it("parses name and May 2026 range", () => {
    const parsed = parseTimesheetHoursQuery(
      "How many hours did Frank Damico work in May 2026?"
    );
    assert.ok(parsed);
    assert.equal(parsed!.employeeName, "Frank Damico");
    assert.equal(parsed!.startDate, "2026-05-01");
    assert.equal(parsed!.endDate, "2026-05-31");
    assert.equal(parsed!.label, "May 2026");
  });

  it("parses August with full month name", () => {
    const parsed = parseTimesheetHoursQuery(
      "How many hours did Reggie work in August 2026?"
    );
    assert.ok(parsed);
    assert.equal(parsed!.employeeName, "Reggie");
    assert.equal(parsed!.startDate, "2026-08-01");
    assert.equal(parsed!.endDate, "2026-08-31");
  });

  it("parses hours for Name in Month Year", () => {
    const parsed = parseTimesheetHoursQuery(
      "hours for Frank Damico in May 2026"
    );
    assert.ok(parsed);
    assert.equal(parsed!.employeeName, "Frank Damico");
  });

  it("returns null without a month", () => {
    assert.equal(
      parseTimesheetHoursQuery("How many hours did Frank Damico work?"),
      null
    );
  });

  it("parses pay-period summary with expected 80 hours", () => {
    const parsed = parseTimesheetRemoteQuery(
      "Timesheet summary June 21 through July 4 2026"
    );
    assert.ok(parsed);
    assert.equal(parsed!.kind, "period_summary");
    if (parsed!.kind !== "period_summary") return;
    assert.equal(parsed.startDate, "2026-06-21");
    assert.equal(parsed.endDate, "2026-07-04");
    assert.equal(parsed.expectedHours, 80);
  });

  it("parses who exceeded between dates", () => {
    const parsed = parseTimesheetRemoteQuery(
      "Who exceeded expected hours between June 21 and July 4 2026?"
    );
    assert.ok(parsed);
    assert.equal(parsed!.kind, "period_summary");
  });
});

describe("timesheet-remote format", () => {
  it("formats daily breakdown and total", () => {
    const msg = formatTimesheetHoursAnswer({
      employeeName: "Frank Damico",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      label: "May 2026",
      days: [
        { date: "2026-05-01", day: "Friday", hours: 8 },
        { date: "2026-05-02", day: "Saturday", hours: 4.5 },
      ],
      totalHours: 12.5,
    });
    assert.match(msg, /Frank Damico worked 12\.5 hours in May 2026/);
    assert.match(msg, /2026-05-01 \(Friday\): 8 hours/);
    assert.match(msg, /TOTAL: 12\.5 hours/);
  });

  it("handles empty month", () => {
    const msg = formatTimesheetHoursAnswer({
      employeeName: "Reggie",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      label: "August 2026",
      days: [],
      totalHours: 0,
    });
    assert.match(msg, /no timesheet hours/);
  });

  it("formats period variance summary", () => {
    const msg = formatTimesheetPeriodAnswer({
      startDate: "2026-06-21",
      endDate: "2026-07-04",
      label: "2026-06-21 through 2026-07-04",
      expectedHours: 80,
      employees: [
        {
          userId: "1",
          employeeName: "Alex",
          employeeEmail: "a@x.com",
          role: "dev",
          totalHours: 88,
          expectedHours: 80,
          varianceHours: 8,
          status: "Exceeded",
          entryCount: 10,
          firstEntryDate: "2026-06-21",
          lastEntryDate: "2026-07-03",
        },
        {
          userId: "2",
          employeeName: "Sam",
          employeeEmail: null,
          role: null,
          totalHours: 72,
          expectedHours: 80,
          varianceHours: -8,
          status: "Below",
          entryCount: 8,
          firstEntryDate: "2026-06-22",
          lastEntryDate: "2026-07-02",
        },
      ],
    });
    assert.match(msg, /expected 80 hrs/);
    assert.match(msg, /Alex · dev: 88 hrs/);
    assert.match(msg, /Exceeded/);
    assert.match(msg, /Below 1/);
  });
});
