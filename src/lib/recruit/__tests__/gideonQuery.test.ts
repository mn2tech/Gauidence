import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatRecruitJobs,
  parseRecruitGideonQuery,
  wantsRecruitQuery,
} from "../gideonQuery";
import type { RecruitmentJob } from "../types";

describe("recruit Gideon query", () => {
  it("parses list jobs", () => {
    const result = parseRecruitGideonQuery("Show me my recruiting jobs");
    assert.equal(result.intent, "list_jobs");
    assert.equal(wantsRecruitQuery("What's in the hiring pipeline?"), true);
  });

  it("does not steal unrelated questions", () => {
    assert.equal(wantsRecruitQuery("Show me my calendar"), false);
    assert.equal(parseRecruitGideonQuery("What invoices are overdue?").intent, "unknown");
  });

  it("parses candidates and top matches", () => {
    assert.equal(
      parseRecruitGideonQuery("Who are the candidates for the engineer role?").intent,
      "candidates"
    );
    assert.equal(
      parseRecruitGideonQuery("Show the top candidates").intent,
      "top_matches"
    );
  });

  it("requires confirmation to shortlist a named candidate", () => {
    const ask = parseRecruitGideonQuery("Shortlist Jordan");
    assert.equal(ask.intent, "shortlist");
    assert.equal(ask.candidateName, "Jordan");
    assert.equal(ask.reviewStatus, "shortlisted");
    assert.equal(ask.requiresConfirmation, true);

    const confirmed = parseRecruitGideonQuery("Yes, shortlist Jordan");
    assert.equal(confirmed.confirmed, true);
    assert.equal(confirmed.requiresConfirmation, false);
  });

  it("confirms a shortlist reply without repeating the name", () => {
    const result = parseRecruitGideonQuery("Yes, shortlist");
    assert.equal(result.intent, "shortlist");
    assert.equal(result.confirmed, true);
    assert.equal(result.reviewStatus, "shortlisted");
  });

  it("reads the shortlist without treating it as a write", () => {
    const result = parseRecruitGideonQuery("Who is on the shortlist?");
    assert.equal(result.intent, "shortlist");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.reviewStatus, undefined);
  });

  it("formats an empty jobs list", () => {
    const text = formatRecruitJobs([]);
    assert.match(text, /No recruitment jobs/);
    assert.match(text, /\/recruit/);
  });

  it("formats job titles", () => {
    const job = {
      id: "j1",
      profile_id: "p1",
      owner_user_id: "u1",
      title: "Software Engineer",
      department: null,
      hiring_manager: null,
      hiring_manager_email: null,
      job_description: "",
      required_skills: [],
      preferred_skills: [],
      min_years_experience: null,
      required_education: null,
      required_certifications: [],
      location: "Remote",
      work_mode: "remote",
      employment_type: null,
      work_authorization_requirement: null,
      salary_range: null,
      shortlist_count: 3,
      status: "active",
      current_step: "review",
      created_at: "",
      updated_at: "",
    } satisfies RecruitmentJob;
    const text = formatRecruitJobs([job]);
    assert.match(text, /Software Engineer/);
    assert.match(text, /Remote/);
  });
});
