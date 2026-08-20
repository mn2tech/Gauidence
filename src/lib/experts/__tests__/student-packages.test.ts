import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isStudentGradePackageExpert,
  packageForGrade,
  packageForGradeLevel,
  parseStudentGrade,
  STUDENT_GRADE_PACKAGES,
} from "@/lib/experts/student-packages";

describe("student grade packages", () => {
  it("ships Grade 9 as the first available package", () => {
    const grade9 = packageForGrade(9);
    assert.ok(grade9);
    assert.equal(grade9?.status, "available");
    assert.equal(grade9?.expertId, "ninth-grade-study-coach");
    assert.ok(grade9!.covers.includes("Algebra I"));
  });

  it("marks 10–12 as coming soon", () => {
    assert.equal(STUDENT_GRADE_PACKAGES.filter((p) => p.status === "coming-soon").length, 3);
  });

  it("parses common grade labels", () => {
    assert.equal(parseStudentGrade("9th"), 9);
    assert.equal(parseStudentGrade("Grade 9"), 9);
    assert.equal(parseStudentGrade("freshman"), 9);
    assert.equal(parseStudentGrade("10"), 10);
    assert.equal(parseStudentGrade("senior"), 12);
    assert.equal(parseStudentGrade(""), null);
  });

  it("resolves a package from vault grade_level text", () => {
    assert.equal(packageForGradeLevel("9th")?.id, "grade-9");
    assert.equal(packageForGradeLevel("sophomore")?.status, "coming-soon");
  });

  it("recognizes the Grade 9 expert id", () => {
    assert.equal(isStudentGradePackageExpert("ninth-grade-study-coach"), true);
    assert.equal(isStudentGradePackageExpert("example-expert"), false);
  });
});
