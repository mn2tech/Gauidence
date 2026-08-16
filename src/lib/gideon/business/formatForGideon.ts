/**
 * Format Business Intelligence structures for Gideon's system prompt.
 * Instructs synthesis + facts vs recommendations — not raw dumps.
 */

import type {
  AdvisoryInsight,
  BusinessQueryPlan,
  Entity360,
  GideonClaim,
  ProposalFollowUpCandidate,
} from "./types";

export const BUSINESS_INTELLIGENCE_PROMPT_V11 = `BUSINESS INTELLIGENCE (Guardian Business Pack V1.1):
You reason over Guardian organizational knowledge — do not dump raw ontology lists or internal workflow items.

Response style:
- Synthesize a concise business briefing with clear sections when relevant:
  Entity Summary · Relationships · Proposals · Projects · Commitments · Risks · Recommendations · Sources
- "Everything we know" means a comprehensive business summary, not every extracted fact.
- Prefer identity, relationship, contacts, engagements, proposals, contracts, projects, commitments, risks, recent activity, and important evidence.
- Never invent amounts, dates, statuses, or relationships. If missing, say "I could not find…" / "Guardian currently shows…".
- Clearly separate:
  Known from Guardian: … 
  Gideon recommendation: …
- Do not present recommendations as if they came from a source document.
- Do not expose SYSTEM/PROCESS metadata (queued documents, extraction jobs, configure settings) as client facts.
- For evidence questions, use PRIOR CLAIMS / SOURCES below — do not run a new unrelated search narrative.
- Keep answers business-oriented and scannable. Offer drill-down ("ask for more detail on proposals") instead of dumping everything.`;

export function formatEntity360ForGideon(entity360: Entity360): string {
  const lines: string[] = [];
  lines.push(`ENTITY: ${entity360.entity.name}`);
  lines.push(`Type: ${entity360.entity.type}`);
  if (entity360.entity.domain) lines.push(`Domain: ${entity360.entity.domain}`);
  if (entity360.entity.aliases.length) {
    lines.push(`Aliases: ${entity360.entity.aliases.slice(0, 6).join(", ")}`);
  }
  if (entity360.entity.description) {
    lines.push(`Notes: ${entity360.entity.description.slice(0, 240)}`);
  }

  if (entity360.relationships.length) {
    lines.push("", "RELATIONSHIPS:");
    for (const rel of entity360.relationships.slice(0, 8)) {
      if (rel.direction === "outgoing") {
        lines.push(
          `• ${entity360.entity.name} —[${rel.type}]→ ${rel.relatedName} (${rel.relatedType})`
        );
      } else {
        lines.push(
          `• ${rel.relatedName} —[${rel.type}]→ ${entity360.entity.name} (${rel.relatedType})`
        );
      }
    }
  }

  if (entity360.people.length) {
    lines.push("", "PEOPLE:");
    for (const p of entity360.people.slice(0, 6)) {
      lines.push(`• ${p.name} (${p.type})`);
    }
  }

  if (entity360.proposals.length) {
    lines.push("", "PROPOSALS:");
    for (const p of entity360.proposals.slice(0, 6)) {
      lines.push(
        `• ${p.title} — ${p.amountLabel ?? "amount unknown"} — status ${p.status}`
      );
    }
  }

  if (entity360.projects.length) {
    lines.push("", "PROJECTS:");
    for (const p of entity360.projects.slice(0, 6)) {
      lines.push(
        `• ${p.name}${p.status ? ` — ${p.status}` : ""}`
      );
    }
  }

  if (entity360.contracts.length) {
    lines.push("", "CONTRACTS:");
    for (const c of entity360.contracts.slice(0, 6)) {
      lines.push(`• ${c.name}`);
    }
  }

  if (entity360.assessments.length) {
    lines.push("", "ASSESSMENTS:");
    for (const a of entity360.assessments.slice(0, 6)) {
      lines.push(`• ${a.name}${a.summary ? ` — ${a.summary.slice(0, 120)}` : ""}`);
    }
  }

  if (entity360.commitments.length) {
    lines.push("", "COMMITMENTS:");
    for (const c of entity360.commitments.slice(0, 8)) {
      lines.push(
        `• [${c.status}] ${c.description}${c.dueDate ? ` (due ${c.dueDate})` : ""}`
      );
    }
  }

  if (entity360.risks.length) {
    lines.push("", "RISKS:");
    for (const r of entity360.risks.slice(0, 6)) {
      lines.push(`• ${r.name}${r.summary ? ` — ${r.summary.slice(0, 120)}` : ""}`);
    }
  }

  if (entity360.evidence.length) {
    lines.push("", "EVIDENCE:");
    for (const ev of entity360.evidence.slice(0, 6)) {
      const src = ev.documentName ? ` [${ev.documentName}]` : "";
      lines.push(`• "${ev.text}"${src}`);
    }
  }

  if (entity360.gaps.length) {
    lines.push("", "GAPS / UNCERTAINTY:");
    for (const g of entity360.gaps) lines.push(`• ${g}`);
  }

  return lines.join("\n");
}

/**
 * User-facing Entity 360 answer — synthesized briefing, not a numbered fact dump.
 */
export function formatEntity360UserAnswer(entity360: Entity360): string {
  const name = entity360.entity.name;
  const parts: string[] = [name, ""];

  parts.push("Relationship");
  const serveRel = entity360.relationships.find((r) =>
    /SERVES|CLIENT_OF|PROPOSED_TO/i.test(r.type)
  );
  if (serveRel) {
    if (serveRel.direction === "incoming") {
      parts.push(
        `${name} appears in Guardian as related to ${serveRel.relatedName} (${serveRel.type}).`
      );
    } else {
      parts.push(
        `${name} —[${serveRel.type}]→ ${serveRel.relatedName}.`
      );
    }
  } else if (entity360.entity.type) {
    parts.push(
      `${name} appears in Guardian as a ${entity360.entity.type}${
        entity360.entity.domain ? ` (${entity360.entity.domain})` : ""
      }.`
    );
  }
  parts.push("");

  if (entity360.assessments.length || entity360.risks.length) {
    parts.push("Current Work / Assessments");
    for (const a of entity360.assessments.slice(0, 3)) {
      parts.push(
        a.summary
          ? `Guardian contains ${a.name}: ${a.summary.slice(0, 200)}`
          : `Guardian contains ${a.name}.`
      );
    }
    for (const r of entity360.risks.slice(0, 3)) {
      parts.push(`• Risk: ${r.name}${r.summary ? ` — ${r.summary.slice(0, 120)}` : ""}`);
    }
    parts.push("");
  }

  if (entity360.proposals.length) {
    parts.push("Commercial Activity");
    for (const p of entity360.proposals.slice(0, 4)) {
      parts.push(
        `• ${p.title}${p.amountLabel ? ` — ${p.amountLabel}` : ""} (status: ${p.status})`
      );
    }
    parts.push("");
  }

  if (entity360.projects.length || entity360.contracts.length) {
    parts.push("Projects & Contracts");
    for (const p of entity360.projects.slice(0, 4)) {
      parts.push(`• Project: ${p.name}${p.status ? ` (${p.status})` : ""}`);
    }
    for (const c of entity360.contracts.slice(0, 4)) {
      parts.push(`• Contract: ${c.name}`);
    }
    parts.push("");
  }

  if (entity360.people.length) {
    parts.push("People");
    for (const p of entity360.people.slice(0, 5)) {
      parts.push(`• ${p.name} (${p.type})`);
    }
    parts.push("");
  }

  if (entity360.commitments.length) {
    parts.push("Commitments");
    for (const c of entity360.commitments.slice(0, 6)) {
      parts.push(
        `• [${c.status}] ${c.description}${c.dueDate ? ` (due ${c.dueDate})` : ""}`
      );
    }
    parts.push("");
  }

  const attention: string[] = [];
  if (entity360.risks.length) {
    attention.push("Confirm whether critical security remediation was completed.");
  }
  if (entity360.proposals.length && !entity360.projects.length) {
    attention.push(
      "Determine the current status of open proposals — Guardian does not currently show an active linked project."
    );
  }
  for (const g of entity360.gaps.slice(0, 2)) {
    attention.push(g);
  }
  if (attention.length) {
    parts.push("Items Requiring Attention");
    parts.push("Gideon recommendation:");
    for (const item of attention.slice(0, 4)) {
      parts.push(`• ${item}`);
    }
    parts.push("");
  }

  if (entity360.evidence.length) {
    parts.push("Sources");
    const seen = new Set<string>();
    for (const ev of entity360.evidence.slice(0, 5)) {
      const label = ev.documentName ?? ev.text.slice(0, 60);
      if (seen.has(label)) continue;
      seen.add(label);
      parts.push(`• ${label}`);
    }
  }

  parts.push("");
  parts.push(
    "Known from Guardian: the sections above. Ask a follow-up to drill into proposals, risks, or evidence."
  );

  return parts.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
}

export function formatProposalFollowUpsForGideon(
  candidates: ProposalFollowUpCandidate[]
): string {
  if (!candidates.length) {
    return "(no proposal follow-up candidates from structured scoring)";
  }
  const lines = ["PROPOSAL FOLLOW-UP CANDIDATES (ranked; include WHY):"];
  for (const c of candidates.slice(0, 8)) {
    lines.push(`• ${c.clientName} — ${c.title}`);
    lines.push(`  Amount: ${c.amountLabel ?? "unknown"} | Status: ${c.status} | Score: ${c.score}`);
    lines.push(`  Reasons: ${c.reasons.join(" ")}`);
    lines.push(`  Recommended: ${c.recommendedAction}`);
  }
  return lines.join("\n");
}

export function formatAdvisoryForGideon(insights: AdvisoryInsight[]): string {
  if (!insights.length) {
    return "(no ranked advisory priorities from current business state)";
  }
  const lines = [
    "ADVISORY PRIORITIES (internal ranking = urgency × impact × confidence):",
    "Present as ranked focus items with Why, Evidence, Confidence, and Recommended next step.",
    "Label judgment as Gideon recommendation; label supporting proposal/ontology items as Known from Guardian.",
  ];
  insights.slice(0, 8).forEach((insight, i) => {
    lines.push("");
    lines.push(`${i + 1}. ${insight.title}`);
    lines.push(`   Why: ${insight.why}`);
    lines.push(`   Confidence: ${insight.confidence.toFixed(2)}`);
    lines.push(`   Recommended next step: ${insight.recommendedNextStep}`);
    if (insight.evidence.length) {
      lines.push(
        `   Evidence: ${insight.evidence.map((e) => e.label ?? e.sourceId).join("; ")}`
      );
    }
  });
  return lines.join("\n");
}

export function formatClaimsForGideon(
  claims: GideonClaim[],
  title = "CLAIMS WITH EVIDENCE"
): string {
  if (!claims.length) return `(no ${title.toLowerCase()})`;
  const lines = [`${title}:`];
  claims.slice(0, 20).forEach((c, i) => {
    lines.push(
      `${i + 1}. [${c.kind ?? "KNOWN_FACT"}] ${c.claim}`
    );
    for (const ev of c.evidence.slice(0, 3)) {
      const href = ev.href ? ` → ${ev.href}` : "";
      lines.push(
        `   - ${ev.label ?? ev.sourceType}:${ev.sourceId}${ev.reference ? ` (${ev.reference})` : ""}${href}`
      );
    }
  });
  return lines.join("\n");
}

export function formatBusinessIntelligenceBlock(args: {
  plan: BusinessQueryPlan;
  sections: string[];
}): string {
  // Plan is internal — include intent only for the model as retrieval guidance, not for user display.
  const header = [
    BUSINESS_INTELLIGENCE_PROMPT_V11,
    "",
    `Internal retrieval plan (do not mention to user): intent=${args.plan.intent}; strategy=${args.plan.strategy}; entities=${args.plan.entities.join("|") || "none"}`,
    "",
  ];
  return [...header, ...args.sections.filter(Boolean)].join("\n");
}
