import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveWebsiteScanDrafts } from "../website/saveDrafts.ts";

type Row = Record<string, unknown>;

function mockAdmin(existing: { facts: Row[]; events: Row[] }) {
  const inserted: { table: string; row: Row }[] = [];
  return {
    inserted,
    client: {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({
                  data: table === "knowledge_facts" ? existing.facts : existing.events,
                  error: null,
                });
              },
            };
          },
          insert(row: Row) {
            inserted.push({ table, row });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

describe("saveWebsiteScanDrafts", () => {
  it("skips exact duplicate facts and events; never auto-publishes", async () => {
    const existingFact = {
      id: "f1",
      organization_slug: "crossroadsconnect",
      title: "Purpose",
      content: "Helping leaders integrate faith.",
      source_url: "https://www.crossroadsconnect.us/",
      lifecycle_status: "draft",
      visibility: "private",
    };
    const existingEvent = {
      id: "e1",
      organization_slug: "crossroadsconnect",
      title: "August Gathering",
      start_at: "2026-08-21T12:00:00.000Z",
      lifecycle_status: "published",
      visibility: "public",
    };
    const mock = mockAdmin({
      facts: [existingFact],
      events: [existingEvent],
    });

    const result = await saveWebsiteScanDrafts({
      admin: mock.client as never,
      userId: "admin-1",
      facts: [
        {
          category: "purpose",
          title: "Purpose",
          content: "Helping leaders integrate faith.",
          source_url: "https://www.crossroadsconnect.us/",
        },
        {
          category: "program",
          title: "Programs",
          content: "Executive Gatherings and networking.",
          source_url: "https://www.crossroadsconnect.us/",
        },
      ],
      events: [
        {
          title: "August Gathering",
          description: "dup",
          start_at: "2026-08-21T12:00:00.000Z",
          end_at: null,
          location: "",
          organizer: "",
          contact: "",
          rsvp_url: "",
          cost: "",
          audience: "",
          source_url: "https://www.crossroadsconnect.us/events",
        },
        {
          title: "September Meetup",
          description: "new",
          start_at: "2026-09-18T12:00:00.000Z",
          end_at: null,
          location: "Rockville",
          organizer: "",
          contact: "",
          rsvp_url: "",
          cost: "",
          audience: "",
          source_url: "https://www.crossroadsconnect.us/events",
        },
      ],
    });

    assert.equal(result.facts_found, 2);
    assert.equal(result.events_found, 2);
    assert.equal(result.facts_created, 1);
    assert.equal(result.events_created, 1);
    assert.equal(result.skipped_duplicates, 2);
    assert.ok(
      mock.inserted.every(
        (row) =>
          row.row.lifecycle_status === "draft" ||
          row.row.lifecycle_status === "needs_review"
      )
    );
    assert.ok(mock.inserted.every((row) => row.row.visibility === "private"));
  });

  it("creates needs_review when website content conflicts with admin-edited draft", async () => {
    const existingFact = {
      id: "f1",
      organization_slug: "crossroadsconnect",
      title: "Purpose",
      content: "Admin edited purpose text.",
      source_url: "https://www.crossroadsconnect.us/",
      lifecycle_status: "draft",
      visibility: "private",
    };
    const mock = mockAdmin({ facts: [existingFact], events: [] });

    await saveWebsiteScanDrafts({
      admin: mock.client as never,
      userId: "admin-1",
      facts: [
        {
          category: "purpose",
          title: "Purpose",
          content: "Website now says something different.",
          source_url: "https://www.crossroadsconnect.us/",
        },
      ],
      events: [],
    });

    assert.equal(mock.inserted.length, 1);
    assert.equal(mock.inserted[0]?.row.lifecycle_status, "needs_review");
    assert.equal(mock.inserted[0]?.row.visibility, "private");
  });
});
