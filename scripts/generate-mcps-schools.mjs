import fs from "node:fs";
import path from "node:path";

const pdfTextPath =
  process.argv[2] ??
  "C:/Users/kolaw/.cursor/projects/c-Users-kolaw-Projects-Gauidence-AI/agent-tools/faa61b89-9657-48bb-88e8-1e1b1f621080.txt";
const outPath =
  process.argv[3] ??
  path.join(process.cwd(), "src/lib/mcps-parent/schools.ts");

const text = fs.readFileSync(pdfTextPath, "utf8").replace(/\r/g, "");

const sections = [
  {
    key: "elementary",
    label: "Elementary schools",
    header: "ELEMENTARY SCHOOLS",
    suffix: " Elementary School",
    until: "MIDDLE SCHOOLS",
  },
  {
    key: "middle",
    label: "Middle schools",
    header: "MIDDLE SCHOOLS",
    suffix: " Middle School",
    until: "HIGH SCHOOLS",
  },
  {
    key: "high",
    label: "High schools",
    header: "HIGH SCHOOLS",
    suffix: " High School",
    until: "TECHNICAL CAREER",
  },
  {
    key: "technical",
    label: "Technical / career",
    header: "TECHNICAL CAREER",
    suffix: "",
    until: "SPECIAL SCHOOLS",
  },
  {
    key: "special",
    label: "Special schools",
    header: "SPECIAL SCHOOLS",
    suffix: "",
    until: "ALTERNATIVE EDUCATION",
  },
  {
    key: "alternative",
    label: "Alternative programs",
    header: "ALTERNATIVE EDUCATION",
    suffix: "",
    until: "EARLY CHILDHOOD",
  },
  {
    key: "early",
    label: "Early childhood",
    header: "EARLY CHILDHOOD",
    suffix: "",
    until: "PUBLIC CHARTER",
  },
  {
    key: "charter",
    label: "Charter schools",
    header: "PUBLIC CHARTER",
    suffix: "",
    until: "ENVIRONMENTAL",
  },
];

function extractBlock(start, end) {
  const si = text.indexOf(start);
  const ei = text.indexOf(end, si + start.length);
  return si >= 0 ? text.slice(si, ei >= 0 ? ei : text.length) : "";
}

function parseName(line) {
  const m = line.trim().match(/^\d+\s+(.+?),\s*\d/);
  return m ? m[1].trim() : null;
}

function formatName(raw, suffix) {
  if (!raw) return null;
  const name = raw
    .replace(/\s+ES\s+/, " Elementary School at ")
    .replace(/\s+HS\s+/, " High School ");
  if (
    /elementary school|middle school|high school|learning center|school of technology|institute|regional institute|center/i.test(
      name
    )
  ) {
    return name;
  }
  if (suffix && !name.toLowerCase().endsWith(suffix.trim().toLowerCase())) {
    return name + suffix;
  }
  return name;
}

const groups = {};
for (const s of sections) {
  const block = extractBlock(s.header, s.until);
  const names = [];
  for (const line of block.split("\n")) {
    const name = formatName(parseName(line), s.suffix);
    if (name) names.push(name);
  }
  groups[s.key] = {
    label: s.label,
    schools: [...new Set(names)].sort((a, b) => a.localeCompare(b)),
  };
}

const flat = [...new Set(Object.values(groups).flatMap((g) => g.schools))].sort(
  (a, b) => a.localeCompare(b)
);

const lines = [
  "/** Official MCPS school names (2025–2026 list). */",
  "",
  "export type McpsSchoolGroup = {",
  "  label: string;",
  "  schools: readonly string[];",
  "};",
  "",
  "export const MCPS_SCHOOL_GROUPS: Record<string, McpsSchoolGroup> = {",
];

for (const [key, g] of Object.entries(groups)) {
  lines.push(`  ${key}: {`);
  lines.push(`    label: ${JSON.stringify(g.label)},`);
  lines.push("    schools: [");
  for (const n of g.schools) lines.push(`      ${JSON.stringify(n)},`);
  lines.push("    ],");
  lines.push("  },");
}
lines.push("} as const;", "", "export const MCPS_SCHOOL_OPTIONS: readonly string[] = [");
for (const n of flat) lines.push(`  ${JSON.stringify(n)},`);
lines.push(
  "] as const;",
  "",
  "export function isKnownMcpsSchool(name: string): boolean {",
  "  const t = name.trim();",
  "  if (!t) return false;",
  "  return MCPS_SCHOOL_OPTIONS.some((s) => s.toLowerCase() === t.toLowerCase());",
  "}",
  "",
  "export function resolveMcpsSchoolName(name: string): string | null {",
  "  const t = name.trim();",
  "  if (!t) return null;",
  "  return MCPS_SCHOOL_OPTIONS.find((s) => s.toLowerCase() === t.toLowerCase()) ?? null;",
  "}",
  ""
);

fs.writeFileSync(outPath, lines.join("\n"));
console.log(`Wrote ${flat.length} schools to ${outPath}`);
