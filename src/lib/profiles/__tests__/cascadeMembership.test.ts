import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cascadeMembershipToFamilyChildren,
  mirrorFamilyCollaboratorsOntoChild,
} from "@/lib/profiles/cascadeMembership";

type Row = Record<string, unknown>;

function mockAdmin(opts: {
  childIds?: string[];
  members?: Row[];
  upsertError?: string | null;
}) {
  const upserts: Row[][] = [];
  const client = {
    from(table: string) {
      if (table === "guardian_profiles") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({
                  data: (opts.childIds ?? []).map((id) => ({ id })),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === "guardian_profile_members") {
        return {
          select() {
            return {
              eq() {
                return {
                  neq() {
                    return Promise.resolve({
                      data: opts.members ?? [],
                      error: null,
                    });
                  },
                };
              },
            };
          },
          upsert(rows: Row[] | Row) {
            upserts.push(Array.isArray(rows) ? rows : [rows]);
            return Promise.resolve({
              error: opts.upsertError
                ? { message: opts.upsertError }
                : null,
            });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, upserts };
}

describe("cascadeMembershipToFamilyChildren", () => {
  it("upserts editor membership on each child Space", async () => {
    const mock = mockAdmin({ childIds: ["kid-1", "home-1"] });
    const n = await cascadeMembershipToFamilyChildren(mock.client as never, {
      familyProfileId: "fam-1",
      userId: "partner-1",
      role: "editor",
      invitedBy: "owner-1",
    });
    assert.equal(n, 2);
    assert.equal(mock.upserts.length, 1);
    assert.deepEqual(mock.upserts[0], [
      {
        profile_id: "kid-1",
        user_id: "partner-1",
        role: "editor",
        invited_by: "owner-1",
      },
      {
        profile_id: "home-1",
        user_id: "partner-1",
        role: "editor",
        invited_by: "owner-1",
      },
    ]);
  });

  it("skips owner role and empty children", async () => {
    const mock = mockAdmin({ childIds: ["kid-1"] });
    const n = await cascadeMembershipToFamilyChildren(mock.client as never, {
      familyProfileId: "fam-1",
      userId: "owner-1",
      role: "owner",
      invitedBy: null,
    });
    assert.equal(n, 0);
    assert.equal(mock.upserts.length, 0);
  });

  it("maps non-viewer roles to editor", async () => {
    const mock = mockAdmin({ childIds: ["kid-1"] });
    await cascadeMembershipToFamilyChildren(mock.client as never, {
      familyProfileId: "fam-1",
      userId: "p1",
      role: "admin",
      invitedBy: null,
    });
    assert.equal(mock.upserts[0]![0]!.role, "editor");
  });
});

describe("mirrorFamilyCollaboratorsOntoChild", () => {
  it("copies non-owner Family members onto the new child", async () => {
    const mock = mockAdmin({
      members: [
        { user_id: "p1", role: "editor", invited_by: "o1" },
        { user_id: "p2", role: "viewer", invited_by: null },
      ],
    });
    const n = await mirrorFamilyCollaboratorsOntoChild(mock.client as never, {
      familyProfileId: "fam-1",
      childProfileId: "kid-new",
    });
    assert.equal(n, 2);
    assert.deepEqual(mock.upserts[0], [
      {
        profile_id: "kid-new",
        user_id: "p1",
        role: "editor",
        invited_by: "o1",
      },
      {
        profile_id: "kid-new",
        user_id: "p2",
        role: "viewer",
        invited_by: null,
      },
    ]);
  });
});
