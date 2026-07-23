#!/usr/bin/env tsx
import { validateExpertsCatalog } from "../src/lib/experts/validate-expert";

const issues = validateExpertsCatalog();

if (issues.length === 0) {
  console.log("All expert definitions are valid.");
  process.exit(0);
}

console.error("Expert validation failed:\n");
for (const issue of issues) {
  const prefix = issue.expertId ? `[${issue.expertId}] ` : "";
  console.error(`${prefix}${issue.message}`);
}
process.exit(1);
