import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCapabilityTags,
  extractTechnologyTags,
  formatAgencies,
  mergeAgencies,
  normalizeAgencyName,
  normalizeNaicsCode,
  parseNaicsList,
  parseSmallBusinessStatuses,
  statusesFromSamCodes,
} from "../research/normalize";
import { detectResearchConflicts } from "../research/conflicts";
import { computePartnerFit, pickSuggestedOwner } from "../research/partnerFit";
import { makeFact, summarizeFacts } from "../research/facts";
import type { LeadResearchSnapshot } from "../research/types";
import { parseSmallBusinessStatus } from "../validators";

function baseSnapshot(
  overrides: Partial<LeadResearchSnapshot> = {}
): LeadResearchSnapshot {
  return {
    mode: "full",
    researchedAt: "2026-08-18T12:00:00.000Z",
    query: { companyName: "Easy Dynamics", website: "https://www.easydynamics.com" },
    companyName: "Easy Dynamics",
    legalCompanyName: "EASY DYNAMICS CORPORATION",
    website: "https://easydynamics.com",
    linkedinUrl: "",
    headquarters: "McLean, VA",
    companyDescription: "Federal ICAM contractor",
    marketAgency: "Department of the Treasury",
    smallBusinessStatuses: ["Small Business"],
    uei: "ABC123DEF456",
    cageCode: "1ABC2",
    naics: [
      { code: "541511", title: "Custom Computer Programming Services", isPrimary: true },
      { code: "541512", title: "Computer Systems Design Services", isPrimary: false },
    ],
    capabilityTags: ["ICAM", "Cybersecurity"],
    agencies: [
      { name: "Department of the Treasury", bureaus: ["Internal Revenue Service"] },
    ],
    vehicles: [
      {
        name: "GSA 8(a) STARS III",
        contractNumber: "47QTCB22D0022",
        vehicleType: "GWAC",
        awardingAgency: "GSA",
        startDate: "",
        endDate: "",
        status: "Active",
        source: "USASpending.gov",
      },
    ],
    contracts: [],
    opportunities: [],
    opportunitiesVerified: true,
    pastPerformanceTags: ["ICAM", "Cybersecurity"],
    technologyTags: ["Azure"],
    suggestedRelationshipOwner: null,
    partnerFit: {
      score: 80,
      priority: "High",
      relationshipType: "Target Prime / Teaming Partner",
      whyCompanyMatters: "Treasury ICAM overlap.",
      nm2techCanBring: ["Data Engineering", "AI/ML"],
      outreachAngle: "Explore teaming on ICAM programs.",
      signals: [],
    },
    facts: {},
    checklist: {
      companyIdentified: true,
      ueiVerified: true,
      cageVerified: true,
      naicsCount: 2,
      agencyCount: 1,
      vehicleCount: 1,
      contractsFound: false,
      partnerFitCalculated: true,
    },
    summary: { populated: 10, verified: 6, needsReview: 2, notFound: 2 },
    sourcesUsed: [],
    ...overrides,
  };
}

describe("lead research normalize", () => {
  it("collapses Treasury aliases to one parent agency", () => {
    const merged = mergeAgencies([
      "Department of Treasury",
      "Treasury",
      "U.S. Treasury",
      "IRS",
      "TTB",
      "FinCEN",
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.name, "Department of the Treasury");
    assert.ok(merged[0]?.bureaus.includes("Internal Revenue Service"));
    assert.ok(merged[0]?.bureaus.includes("Alcohol and Tobacco Tax and Trade Bureau"));
    assert.match(formatAgencies(merged), /Department of the Treasury/);
  });

  it("normalizeAgencyName maps DHS and CISA", () => {
    assert.equal(normalizeAgencyName("DHS").name, "Department of Homeland Security");
    assert.equal(
      normalizeAgencyName("CISA").bureau,
      "Cybersecurity and Infrastructure Security Agency"
    );
  });

  it("parses NAICS with a primary marker", () => {
    const list = parseNaicsList("541511 — Custom Computer Programming Services — PRIMARY\n541512");
    assert.equal(list[0]?.code, "541511");
    assert.equal(list[0]?.isPrimary, true);
    assert.equal(list[1]?.code, "541512");
    assert.equal(normalizeNaicsCode("54151100"), "541511");
  });

  it("turns capability paragraphs into short tags", () => {
    const tags = extractCapabilityTags([
      "Identity Credential and Access Management",
      "cybersecurity",
      "We have been providing world-class digital transformation services for over twenty years across the federal landscape",
      "Zero Trust",
    ]);
    assert.ok(tags.includes("ICAM"));
    assert.ok(tags.includes("Cybersecurity"));
    assert.ok(tags.includes("Zero Trust"));
    assert.equal(
      tags.some((t) => t.length > 40),
      false
    );
  });

  it("only keeps named technologies, not industry generics", () => {
    const tags = extractTechnologyTags(["Azure", "cloud", "innovation", "AWS"]);
    assert.deepEqual(tags, ["Azure", "AWS"]);
  });

  it("supports multi-value small-business status including SDB and ANC", () => {
    assert.deepEqual(parseSmallBusinessStatuses("Small Business, 8(a), SDVOSB"), [
      "Small Business",
      "8(a)",
      "SDVOSB",
    ]);
    assert.deepEqual(parseSmallBusinessStatuses(["SDB", "HUBZone", "ANC"]), [
      "SDB",
      "HUBZone",
      "ANC",
    ]);
    assert.equal(
      parseSmallBusinessStatus(["WOSB", "EDWOSB"]),
      "WOSB, EDWOSB"
    );
  });

  it("maps SAM business type codes to statuses and does not infer from marketing", () => {
    assert.deepEqual(statusesFromSamCodes(["2X", "A6", "XX"]), [
      "Small Business",
      "8(a)",
      "HUBZone",
    ]);
    assert.deepEqual(statusesFromSamCodes(["we are an 8(a) firm"]), []);
  });
});

describe("lead research conflicts", () => {
  it("does not conflict when existing is empty", () => {
    const conflicts = detectResearchConflicts(
      { companyName: "", uei: "" },
      baseSnapshot()
    );
    assert.equal(conflicts.length, 0);
  });

  it("flags overwrite when existing NAICS differs and offers merge", () => {
    const conflicts = detectResearchConflicts(
      { naicsCodes: "541511" },
      baseSnapshot()
    );
    const naics = conflicts.find((c) => c.field === "naics");
    assert.ok(naics);
    assert.equal(naics?.existing, "541511");
    assert.match(naics?.researched ?? "", /541512/);
    assert.ok(naics?.mergeValue);
  });
});

describe("lead research partner fit", () => {
  it("scores a Treasury ICAM prime as high without inventing an owner", () => {
    const fit = computePartnerFit({
      workspaceName: "NM2TECH",
      agencies: [{ name: "Department of the Treasury", bureaus: ["Internal Revenue Service"] }],
      capabilities: ["ICAM", "Cybersecurity"],
      technologies: ["Azure"],
      naics: [{ code: "541511", title: "", isPrimary: true }],
      vehicles: [{ name: "GSA 8(a) STARS III" }],
      contracts: [
        {
          name: "Treasury ICAM support",
          contractNumber: "123",
          agency: "Department of the Treasury",
          role: "prime",
          awardValue: "1000000",
          ceilingValue: "",
          awardDate: "",
          periodOfPerformance: "",
          capabilityArea: "ICAM",
          source: "USASpending.gov",
          status: "Active",
          contractType: "task_order",
        },
      ],
      opportunities: [],
      smallBusinessStatuses: ["Small Business"],
      headquarters: "McLean, VA",
      suggestedOwner: null,
      companyName: "Easy Dynamics",
    });
    assert.ok(fit.score >= 70);
    assert.equal(fit.priority, "High");
    assert.match(fit.relationshipType, /Prime|Teaming/i);
    assert.ok(fit.nm2techCanBring.includes("Data Engineering") || fit.nm2techCanBring.includes("AI/ML"));
    assert.match(fit.outreachAngle, /Easy Dynamics/);
    assert.doesNotMatch(fit.outreachAngle, /Michael/);
  });

  it("only suggests a relationship owner from workspace evidence", () => {
    assert.equal(
      pickSuggestedOwner(
        [{ companyName: "Other Co", website: null, owner: "Michael" }],
        { companyName: "Easy Dynamics", website: "" }
      ),
      null
    );
    const suggested = pickSuggestedOwner(
      [{ companyName: "Easy Dynamics Corporation", website: "easydynamics.com", owner: "Michael" }],
      { companyName: "Easy Dynamics", website: "https://www.easydynamics.com" }
    );
    assert.equal(suggested?.name, "Michael");
  });
});

describe("lead research facts", () => {
  it("does not count empty values as verified", () => {
    const empty = makeFact("", "verified", "SAM.gov", "sam.gov");
    assert.equal(empty.confidence, "not_found");
    const summary = summarizeFacts({
      uei: makeFact("ABC", "verified", "SAM.gov", "sam.gov"),
      cage: makeFact("", "verified", "SAM.gov", "sam.gov"),
      caps: makeFact(["ICAM"], "medium", "Website", "company_website"),
    });
    assert.equal(summary.populated, 2);
    assert.equal(summary.verified, 1);
    assert.equal(summary.needsReview, 1);
    assert.equal(summary.notFound, 1);
  });
});
