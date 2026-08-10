import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  canAccessSimpleHome,
  getGuardianSimpleHomeFlag,
} from "@/lib/features/simple-home";
import {
  greetingName,
  simpleHomeProfileCategory,
  timeOfDayGreeting,
} from "@/lib/simple-home/helpers";
import { signedInLandingPath, vaultsHref, spacesViewFromParam } from "@/lib/simple-home/routing";

describe("guardian simple home feature flag", () => {
  const original = process.env.GUARDIAN_SIMPLE_HOME_FLAG;

  afterEach(() => {
    if (original === undefined) delete process.env.GUARDIAN_SIMPLE_HOME_FLAG;
    else process.env.GUARDIAN_SIMPLE_HOME_FLAG = original;
  });

  it("defaults to disabled", () => {
    delete process.env.GUARDIAN_SIMPLE_HOME_FLAG;
    assert.equal(getGuardianSimpleHomeFlag(), "disabled");
    assert.equal(canAccessSimpleHome({ email: "user@example.com" }), false);
  });

  it("allows access when enabled", () => {
    process.env.GUARDIAN_SIMPLE_HOME_FLAG = "enabled";
    assert.equal(canAccessSimpleHome({ email: "user@example.com" }), true);
  });
});

describe("simple home helpers", () => {
  it("maps profile types to home categories", () => {
    assert.equal(simpleHomeProfileCategory("personal"), "personal");
    assert.equal(simpleHomeProfileCategory("business"), "business");
    assert.equal(simpleHomeProfileCategory("client"), "client");
    assert.equal(simpleHomeProfileCategory("family"), "family");
    assert.equal(simpleHomeProfileCategory("child"), "family");
  });

  it("builds greetings from account and vault names", () => {
    assert.equal(greetingName("Michael Smith"), "Michael");
    assert.equal(greetingName("You", "Family Vault"), "Family");
    assert.equal(greetingName("You"), "there");
  });

  it("returns time-of-day greetings", () => {
    assert.equal(timeOfDayGreeting(new Date("2026-07-30T09:00:00")), "Good morning");
    assert.equal(timeOfDayGreeting(new Date("2026-07-30T14:00:00")), "Good afternoon");
    assert.equal(timeOfDayGreeting(new Date("2026-07-30T19:00:00")), "Good evening");
  });
});

describe("simple home routing", () => {
  const original = process.env.GUARDIAN_SIMPLE_HOME_FLAG;

  afterEach(() => {
    if (original === undefined) delete process.env.GUARDIAN_SIMPLE_HOME_FLAG;
    else process.env.GUARDIAN_SIMPLE_HOME_FLAG = original;
  });

  it("lands employees on the employee hub", () => {
    process.env.GUARDIAN_SIMPLE_HOME_FLAG = "enabled";
    assert.equal(
      signedInLandingPath({
        profile_type: "employee",
        parent_profile_id: "parent-1",
      }),
      "/employee"
    );
  });

  it("lands other profiles on /home when enabled", () => {
    process.env.GUARDIAN_SIMPLE_HOME_FLAG = "enabled";
    assert.equal(
      signedInLandingPath({ profile_type: "personal", parent_profile_id: null }),
      "/home"
    );
  });

  it("keeps /ask when disabled", () => {
    process.env.GUARDIAN_SIMPLE_HOME_FLAG = "disabled";
    assert.equal(
      signedInLandingPath({ profile_type: "personal", parent_profile_id: null }),
      "/ask"
    );
  });

  it("builds spaces list and map hrefs", () => {
    assert.equal(vaultsHref("list"), "/vaults");
    assert.equal(vaultsHref("map"), "/vaults?view=map");
    assert.equal(spacesViewFromParam("map"), "map");
    assert.equal(spacesViewFromParam(null), "list");
  });
});
