import "server-only";

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type {
  CandidateWithDetails,
  RecruitmentJob,
  RecruitmentJobRequirements,
  ReportData,
} from "./types";
import { RECOMMENDATION_LABELS, effectiveCandidateScore } from "./types";
import { RUBRIC_CATEGORIES } from "./rubric";

export type { ReportData } from "./types";

export function generateCsvReport(data: ReportData): string {
  const headers = [
    "Rank",
    "Candidate",
    "Email",
    "Match Score",
    "Status",
    "Relevant Experience (years)",
    "Required Skill Match %",
    "Missing Requirements",
    "Review Status",
    "Summary",
  ];

  const rows = data.shortlisted.map((c, i) => {
    const score = effectiveCandidateScore(c.score);
    return [
      String(i + 1),
      c.display_name ?? c.extraction?.candidate_name ?? "Unknown",
      c.email ?? c.extraction?.email ?? "",
      score != null ? String(score) : "",
      c.score
        ? RECOMMENDATION_LABELS[c.score.recommendation_status]
        : "",
      c.extraction?.relevant_experience_years != null
        ? String(c.extraction.relevant_experience_years)
        : "",
      c.score?.required_skill_match_pct != null
        ? String(c.score.required_skill_match_pct)
        : "",
      (c.score?.missing_requirements ?? []).join("; "),
      c.review_status,
      (c.review?.edited_summary ?? c.score?.candidate_summary ?? "").replace(
        /"/g,
        '""'
      ),
    ];
  });

  const escape = (v: string) => `"${v}"`;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join(
    "\n"
  );
}

export function generateHtmlReport(data: ReportData): string {
  const { job, rubric, shortlisted, candidates, generatedAt, recruiterName } =
    data;

  const criteriaRows = RUBRIC_CATEGORIES.map(
    (c) =>
      `<tr><td>${c.label}</td><td>${rubric[c.key]}%</td><td>${c.description}</td></tr>`
  ).join("");

  const candidateSections = shortlisted
    .map((c, i) => {
      const score = effectiveCandidateScore(c.score);
      const name =
        c.display_name ?? c.extraction?.candidate_name ?? "Unknown Candidate";
      const summary =
        c.review?.edited_summary ?? c.score?.candidate_summary ?? "";
      const strengths = (c.score?.strengths ?? [])
        .map((s) => `<li>${s}</li>`)
        .join("");
      const concerns = (c.score?.concerns ?? [])
        .map((s) => `<li>${s}</li>`)
        .join("");
      const missing = (c.score?.missing_requirements ?? [])
        .map((s) => `<li>${s}</li>`)
        .join("");
      const questions = (c.score?.interview_questions ?? [])
        .map((s) => `<li>${s}</li>`)
        .join("");

      return `
      <section class="candidate">
        <h2>${i + 1}. ${name}</h2>
        <p><strong>Match Score:</strong> ${score ?? "N/A"} | <strong>Status:</strong> ${c.score ? RECOMMENDATION_LABELS[c.score.recommendation_status] : "N/A"}</p>
        <h3>Summary</h3>
        <p>${summary}</p>
        <h3>Strengths</h3>
        <ul>${strengths || "<li>None noted</li>"}</ul>
        <h3>Concerns</h3>
        <ul>${concerns || "<li>None noted</li>"}</ul>
        <h3>Missing Information</h3>
        <ul>${missing || "<li>None noted</li>"}</ul>
        <h3>Suggested Interview Questions</h3>
        <ol>${questions || "<li>None generated</li>"}</ol>
      </section>`;
    })
    .join("");

  const comparisonRows = shortlisted
    .map((c, i) => {
      const score = effectiveCandidateScore(c.score);
      const name =
        c.display_name ?? c.extraction?.candidate_name ?? "Unknown";
      return `<tr>
        <td>${i + 1}</td>
        <td>${name}</td>
        <td>${score ?? "N/A"}</td>
        <td>${c.score ? RECOMMENDATION_LABELS[c.score.recommendation_status] : "N/A"}</td>
        <td>${c.extraction?.relevant_experience_years ?? "N/A"}</td>
        <td>${c.score?.required_skill_match_pct ?? "N/A"}%</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Hiring Report – ${job.title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
    h2 { color: #333; margin-top: 32px; }
    h3 { color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; }
    .meta { color: #666; font-size: 14px; }
    .disclaimer { background: #fff8e1; border: 1px solid #ffc107; padding: 12px; margin: 20px 0; font-size: 14px; }
    .candidate { page-break-inside: avoid; margin-bottom: 40px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Candidate Shortlist Report</h1>
  <p class="meta">Generated ${new Date(generatedAt).toLocaleString()} by ${recruiterName}</p>

  <div class="disclaimer">
    <strong>Human Review Required:</strong> This report contains AI-generated recommendations only.
    All hiring decisions must be made by qualified human reviewers. AI does not make final employment decisions.
  </div>

  <h2>Job Summary</h2>
  <p><strong>Title:</strong> ${job.title}</p>
  <p><strong>Department:</strong> ${job.department ?? "N/A"}</p>
  <p><strong>Hiring Manager:</strong> ${job.hiring_manager ?? "N/A"}</p>
  <p><strong>Location:</strong> ${job.location ?? "N/A"} (${job.work_mode ?? "N/A"})</p>
  <p><strong>Total Applicants Reviewed:</strong> ${candidates.length}</p>
  <p><strong>Shortlisted:</strong> ${shortlisted.length}</p>

  <h2>Evaluation Criteria</h2>
  <table>
    <tr><th>Category</th><th>Weight</th><th>Description</th></tr>
    ${criteriaRows}
  </table>

  <h2>Ranked Comparison</h2>
  <table>
    <tr><th>Rank</th><th>Candidate</th><th>Score</th><th>Status</th><th>Relevant Exp.</th><th>Skill Match</th></tr>
    ${comparisonRows}
  </table>

  <h2>Candidate Details</h2>
  ${candidateSections}
</body>
</html>`;
}

export async function generateDocxReport(data: ReportData): Promise<Buffer> {
  const { job, rubric, shortlisted, candidates, generatedAt, recruiterName } =
    data;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: "Candidate Shortlist Report",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${new Date(generatedAt).toLocaleString()} by ${recruiterName}`,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Human Review Required: AI recommendations only. All hiring decisions require human review.",
          bold: true,
        }),
      ],
    }),
    new Paragraph({ text: "Job Summary", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `Title: ${job.title}` }),
    new Paragraph({ text: `Department: ${job.department ?? "N/A"}` }),
    new Paragraph({
      text: `Total Applicants: ${candidates.length} | Shortlisted: ${shortlisted.length}`,
    }),
    new Paragraph({ text: "Evaluation Criteria", heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Category")] }),
            new TableCell({ children: [new Paragraph("Weight")] }),
          ],
        }),
        ...RUBRIC_CATEGORIES.map(
          (c) =>
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph(c.label)],
                }),
                new TableCell({
                  children: [new Paragraph(`${rubric[c.key]}%`)],
                }),
              ],
            })
        ),
      ],
    }),
  ];

  for (const [i, c] of shortlisted.entries()) {
    const name =
      c.display_name ?? c.extraction?.candidate_name ?? "Unknown Candidate";
    const score = effectiveCandidateScore(c.score);
    const summary =
      c.review?.edited_summary ?? c.score?.candidate_summary ?? "";

    children.push(
      new Paragraph({
        text: `${i + 1}. ${name}`,
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        text: `Score: ${score ?? "N/A"} | ${c.score ? RECOMMENDATION_LABELS[c.score.recommendation_status] : ""}`,
      }),
      new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_3 }),
      new Paragraph({ text: summary }),
      new Paragraph({ text: "Strengths", heading: HeadingLevel.HEADING_3 }),
      ...(c.score?.strengths ?? []).map((s) => new Paragraph({ text: `• ${s}` })),
      new Paragraph({ text: "Concerns", heading: HeadingLevel.HEADING_3 }),
      ...(c.score?.concerns ?? []).map((s) => new Paragraph({ text: `• ${s}` })),
      new Paragraph({
        text: "Interview Questions",
        heading: HeadingLevel.HEADING_3,
      }),
      ...(c.score?.interview_questions ?? []).map(
        (q, qi) => new Paragraph({ text: `${qi + 1}. ${q}` })
      )
    );
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
