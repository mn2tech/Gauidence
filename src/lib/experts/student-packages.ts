/**
 * Grade-level Student Success packages. Each available package is backed by a
 * Guardian Expert (curriculum + Ask + quizzes). Later grades can ship as
 * coming-soon cards until their expert JSON is ready.
 */

export type StudentGradePackageStatus = "available" | "coming-soon";

export type StudentGradePackage = {
  id: string;
  grade: number;
  label: string;
  title: string;
  expertId: string | null;
  status: StudentGradePackageStatus;
  description: string;
  covers: string[];
};

export const STUDENT_GRADE_PACKAGES: StudentGradePackage[] = [
  {
    id: "grade-9",
    grade: 9,
    label: "Grade 9",
    title: "9th Grade Success Package",
    expertId: "ninth-grade-study-coach",
    status: "available",
    description:
      "A freshman-year coach for typical 9th grade material: Algebra I, English 9, Biology, world history and geography, plus study habits, tests, and projects — so students can keep up and build confidence.",
    covers: [
      "Algebra I",
      "English 9",
      "Biology",
      "World history & geography",
      "Study skills",
      "Tests & projects",
    ],
  },
  {
    id: "grade-10",
    grade: 10,
    label: "Grade 10",
    title: "10th Grade Success Package",
    expertId: null,
    status: "coming-soon",
    description:
      "Sophomore-year help across Geometry or Algebra II, English 10, Chemistry, and world or U.S. history — coming next.",
    covers: ["Geometry / Algebra II", "English 10", "Chemistry", "History"],
  },
  {
    id: "grade-11",
    grade: 11,
    label: "Grade 11",
    title: "11th Grade Success Package",
    expertId: null,
    status: "coming-soon",
    description:
      "Junior-year help for Algebra II or Precalculus, American literature, physics or chemistry, and U.S. history — plus SAT/ACT study habits.",
    covers: ["Algebra II / Precalculus", "American literature", "U.S. history"],
  },
  {
    id: "grade-12",
    grade: 12,
    label: "Grade 12",
    title: "12th Grade Success Package",
    expertId: null,
    status: "coming-soon",
    description:
      "Senior-year help for college-ready math, literature, government/econ, and applications timelines — coming next.",
    covers: ["Precalculus / Stats", "Literature", "Gov / Econ", "College apps"],
  },
];

export const STUDENT_GRADE_OPTIONS = [
  { value: "6th", label: "6th grade" },
  { value: "7th", label: "7th grade" },
  { value: "8th", label: "8th grade" },
  { value: "9th", label: "9th grade" },
  { value: "10th", label: "10th grade" },
  { value: "11th", label: "11th grade" },
  { value: "12th", label: "12th grade" },
] as const;

const GRADE_WORD: Record<string, number> = {
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  freshman: 9,
  sophomore: 10,
  junior: 11,
  senior: 12,
};

/** Map free-text grade_level (e.g. "9th", "Grade 9", "freshman") to 6–12. */
export function parseStudentGrade(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const text = raw.trim().toLowerCase().replace(/[–—]/g, "-");

  const exact = GRADE_WORD[text];
  if (exact) return exact;

  for (const [name, grade] of Object.entries(GRADE_WORD)) {
    if (text.includes(name)) return grade;
  }

  const match = text.match(/\b(1[0-2]|[6-9])(?:st|nd|rd|th)?\b/);
  if (!match) return null;
  const grade = Number(match[1]);
  if (grade < 6 || grade > 12) return null;
  return grade;
}

export function packageForGrade(grade: number): StudentGradePackage | undefined {
  return STUDENT_GRADE_PACKAGES.find((item) => item.grade === grade);
}

export function packageForGradeLevel(
  raw: string | null | undefined
): StudentGradePackage | undefined {
  const grade = parseStudentGrade(raw);
  return grade == null ? undefined : packageForGrade(grade);
}

export function isStudentGradePackageExpert(expertId: string): boolean {
  return STUDENT_GRADE_PACKAGES.some((item) => item.expertId === expertId);
}
