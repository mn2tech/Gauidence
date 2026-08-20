/**
 * Format Business Intelligence structures for Gideon's system prompt.
 * Instructs synthesis + facts vs recommendations — not raw dumps.
 */

import {
  findMentionedButUnavailable,
  formatRelationshipProse,
  inferencePrefix,
} from "@/lib/gideon/evidenceBoundaries";
import { filterUnavailableGapsAgainstSpaceDocs } from "@/lib/gideon/documentGrounding";
import type {
  AdvisoryInsight,
  BusinessQueryPlan,
  Entity360,
  GideonClaim,
  ProposalFollowUpCandidate,
} from "./types";

export const BUSINESS_INTELLIGENCE_PROMPT_V11 = `BUSINESS INTELLIGENCE (Guardian Business Pack V1.1):
You reason over Guardian organizational knowledge — do not dump raw ontology lists or internal workflow items.

Answer the user's question first in natural language. Never begin with ontology/database labels such as "Relationship", "MATCHED ENTITIES", "HAS_RELATIONSHIP", "entity_id", or lines like "Name —[SERVES]→ Target".

Preferred adaptive structure (omit empty sections):
1) Direct answer in plain prose
2) Important details when useful
3) Knowledge gaps when something is referenced but not available, or cannot be determined
4) Sources / evidence (use available source names only)

Evidence boundaries (strict):
- AVAILABLE: only documents/sources actually present in RETRIEVED EXCERPTS, SPACE FILE INVENTORY, citations, or evidence rows with a real document id/name from this Space's authorized scope.
- MENTIONED: a person, org, policy, form, or document named inside an AVAILABLE source. Mention ≠ available. Never say "this Space contains X" or "Guardian contains X" for something only mentioned.
- INFERRED: conclusions you derive — prefix with "Based on the available information…" / "This suggests…" / "Guardian can infer…".

If Document A references Document B, say B is referenced but not currently available unless retrieval confirms B is present.
Do not invent fees, dates, statuses, or relationships. Do not expose SYSTEM/PROCESS metadata as client facts.
For evidence questions, use PRIOR CLAIMS / SOURCES — only cite sources that were actually used.
Keep answers business-oriented and scannable. Do not paste raw RELATIONSHIPS lists unless the user asked to inspect the ontology or knowledge graph.`;

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

function isNoisyRelatedName(name: string): boolean {
  return /\b(follow-?up review|authenticated follow|remediation plan|security assessment|vulnerability assessment|prioritized remediation)\b/i.test(
    name.trim()
  );
}

function formatCommercialLine(
  entityName: string,
  proposal: { title: string; clientName: string | null; amountLabel: string | null; status: string }
): string {
  const title = proposal.title.trim();
  const who = (proposal.clientName?.trim() || entityName).trim();
  const titleAlreadyNamed =
    title.toLowerCase().includes(who.toLowerCase()) ||
    title.toLowerCase().includes(entityName.toLowerCase());
  const head = titleAlreadyNamed ? title : `${who} — ${title}`;
  const amount = proposal.amountLabel ? ` — ${proposal.amountLabel}` : "";
  return `• ${head}${amount} (status: ${proposal.status})`;
}

function availableDocumentLabelsFromEntity360(entity360: Entity360): string[] {
  const labels: string[] = [...(entity360.availableDocumentLabels ?? [])];
  for (const ev of entity360.evidence) {
    if (ev.documentId && ev.documentName) labels.push(ev.documentName);
    else if (ev.documentId && ev.text) labels.push(ev.text.slice(0, 80));
  }
  for (const a of entity360.assessments) {
    if (looksLikeReferencedSourceTitle(a.name)) labels.push(a.name);
  }
  return [...new Set(labels.filter(Boolean))];
}

function evidenceCorpus(entity360: Entity360): string[] {
  const texts: string[] = [];
  if (entity360.entity.description) texts.push(entity360.entity.description);
  for (const ev of entity360.evidence) texts.push(ev.text);
  for (const a of entity360.assessments) {
    if (a.summary) texts.push(a.summary);
    texts.push(a.name);
  }
  return texts;
}

function pickEvidenceSnippets(entity360: Entity360, limit = 4): string[] {
  const snippets: string[] = [];
  for (const ev of entity360.evidence) {
    const text = ev.text.replace(/\s+/g, " ").trim();
    if (text.length < 24) continue;
    snippets.push(text.slice(0, 220));
    if (snippets.length >= limit) break;
  }
  return snippets;
}

function isTopicLikeEntityName(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  // Concepts extracted from disclosures — not standalone documents or work items.
  return (
    /\b(fee structure|asset-?based|compensation model|discretionary (management|authority)|portfolio management|financial planning|retirement planning|investment recommendations?)\b/i.test(
      n
    ) && !looksLikeReferencedSourceTitle(n)
  );
}

function isLikelyDocumentEntity(item: {
  name: string;
  type: string;
  summary?: string | null;
}): boolean {
  if (isTopicLikeEntityName(item.name)) return false;
  if (/^(document|policy|procedure|file)$/i.test(item.type)) {
    return looksLikeReferencedSourceTitle(item.name);
  }
  return looksLikeReferencedSourceTitle(`${item.name} ${item.summary ?? ""}`);
}

function looksLikeReferencedSourceTitle(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 4) return false;
  if (
    /\b(fee structure|asset-?based|compensation|discretionary|portfolio management|financial planning|retirement planning)\b/i.test(
      n
    ) &&
    !/\b(form|policy|handbook|agreement|brochure|schedule|part\s+2)\b/i.test(n)
  ) {
    return false;
  }
  return (
    /\b(form\s+(adv|crs)|part\s+2a|handbook|polic(?:y|ies)|procedure|agreement|brochure|disclosure|schedule A|exhibit)\b/i.test(
      n
    ) || /\.(pdf|docx?|txt)$/i.test(n)
  );
}

function isRealWorkAssessment(item: {
  name: string;
  type: string;
  summary?: string | null;
}): boolean {
  if (isTopicLikeEntityName(item.name)) return false;
  if (isLikelyDocumentEntity(item)) return true;
  return /\b(assessment|audit|review|diagnostic|remediation)\b/i.test(
    `${item.name} ${item.summary ?? ""}`
  );
}

/**
 * User-facing Entity 360 answer — natural-language briefing, not ontology syntax.
 */
export function formatEntity360UserAnswer(entity360: Entity360): string {
  const name = entity360.entity.name;
  const parts: string[] = [];
  const availableDocs = availableDocumentLabelsFromEntity360(entity360);
  const usableRels = entity360.relationships.filter(
    (r) => !isNoisyRelatedName(r.relatedName)
  );
  const preferredRel =
    usableRels.find((r) =>
      /^(SERVES|CLIENT_OF|CONTACT_FOR|EMPLOYS|ENGAGES)$/i.test(r.type)
    ) ??
    usableRels.find((r) =>
      /^(HAS_PROJECT|HAS_CONTRACT|WORKS_ON)$/i.test(r.type)
    ) ??
    usableRels.find(
      (r) =>
        /^PROPOSED_TO$/i.test(r.type) &&
        /proposal/i.test(r.relatedType) &&
        !isNoisyRelatedName(r.relatedName)
    );

  const serveTargets = usableRels
    .filter((r) => /^(SERVES|SERVICES|CLIENT_OF)$/i.test(r.type))
    .map((r) => r.relatedName)
    .filter((n) => !isNoisyRelatedName(n));

  // --- Direct answer ---
  const lead: string[] = [];
  if (entity360.entity.description?.trim()) {
    lead.push(
      `${name} — ${entity360.entity.description.trim().replace(/\s+/g, " ").slice(0, 280)}`
    );
  } else if (serveTargets.length) {
    lead.push(
      `${name} is described in this Space as offering or relating to ${serveTargets
        .slice(0, 4)
        .join(", ")}.`
    );
  } else if (preferredRel) {
    lead.push(
      formatRelationshipProse({
        subject: name,
        type: preferredRel.type,
        related: preferredRel.relatedName,
        direction: preferredRel.direction,
      })
    );
  } else if (entity360.proposals.length) {
    const sample = entity360.proposals[0]?.title ?? "an open proposal";
    lead.push(
      `${inferencePrefix()}, ${name} appears as a client or prospect with commercial proposal activity (${sample}).`
    );
  } else {
    lead.push(
      `${name} appears in this Space as a ${entity360.entity.type}${
        entity360.entity.domain ? ` (${entity360.entity.domain})` : ""
      }.`
    );
  }

  const sourceHint = availableDocs[0];
  if (sourceHint) {
    lead.push(
      `${inferencePrefix()} in ${sourceHint}, Guardian can summarize the details below.`
    );
  }
  parts.push(lead.join(" "));
  parts.push("");

  // --- Important details from evidence ---
  const snippets = pickEvidenceSnippets(entity360);
  if (snippets.length) {
    parts.push("Important details");
    for (const s of snippets) {
      parts.push(`• ${s}${s.length >= 220 ? "…" : ""}`);
    }
    parts.push("");
  }

  const workAssessments = entity360.assessments.filter(isRealWorkAssessment);
  const availableAssessments = workAssessments.filter((a) => {
    if (!isLikelyDocumentEntity(a)) return true;
    return availableDocs.some((label) =>
      label.toLowerCase().includes(a.name.toLowerCase().slice(0, 12))
    );
  });
  const mentionedOnlyDocs = workAssessments.filter(
    (a) => !availableAssessments.includes(a) && isLikelyDocumentEntity(a)
  );

  if (availableAssessments.length || entity360.risks.length) {
    parts.push("Current work");
    for (const a of availableAssessments.slice(0, 3)) {
      parts.push(
        a.summary
          ? `• ${a.name}: ${a.summary.slice(0, 200)}`
          : `• ${a.name}`
      );
    }
    for (const r of entity360.risks.slice(0, 3)) {
      parts.push(
        `• Risk noted: ${r.name}${r.summary ? ` — ${r.summary.slice(0, 120)}` : ""}`
      );
    }
    parts.push("");
  }

  if (entity360.proposals.length) {
    parts.push("Commercial activity");
    for (const p of entity360.proposals.slice(0, 4)) {
      parts.push(formatCommercialLine(name, p));
    }
    parts.push("");
  }

  if (entity360.projects.length || entity360.contracts.length) {
    parts.push("Projects & contracts");
    for (const p of entity360.projects.slice(0, 4)) {
      parts.push(`• ${p.name}${p.status ? ` (${p.status})` : ""}`);
    }
    for (const c of entity360.contracts.slice(0, 4)) {
      parts.push(`• ${c.name}`);
    }
    parts.push("");
  }

  if (entity360.people.length) {
    parts.push("People");
    for (const p of entity360.people.slice(0, 5)) {
      parts.push(`• ${p.name}`);
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

  // --- Knowledge gaps (referenced ≠ available) ---
  const unavailableRefs = findMentionedButUnavailable({
    evidenceTexts: evidenceCorpus(entity360),
    availableDocumentLabels: availableDocs,
  });
  for (const doc of mentionedOnlyDocs) {
    if (
      !unavailableRefs.some((u) =>
        u.toLowerCase().includes(doc.name.toLowerCase().slice(0, 10))
      )
    ) {
      unavailableRefs.push(doc.name);
    }
  }

  const gapLines: string[] = [];
  const seenGaps = new Set<string>();
  const pushGap = (line: string) => {
    const key = line.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seenGaps.has(key)) return;
    seenGaps.add(key);
    gapLines.push(line);
  };

  for (const g of entity360.gaps) {
    // Drop legacy CRM absence gaps if any remain in stored/older payloads.
    if (
      /proposals linked|active project linked|contact people were found/i.test(g)
    ) {
      continue;
    }
    pushGap(g);
  }
  for (const ref of unavailableRefs.slice(0, 3)) {
    pushGap(
      `Available sources reference ${ref}, but that document does not appear to be available in this Space.`
    );
  }
  // Re-check against Space inventory — uploaded Form ADV must not stay "missing".
  const cleanedGaps = filterUnavailableGapsAgainstSpaceDocs(
    gapLines,
    availableDocs
  );
  gapLines.length = 0;
  gapLines.push(...cleanedGaps);
  // Only mention missing projects when this entity actually has proposals.
  if (entity360.proposals.length && !entity360.projects.length) {
    pushGap(
      "Guardian does not currently show an active linked project for open proposals."
    );
  }

  if (gapLines.length) {
    parts.push("Missing information");
    for (const g of gapLines.slice(0, 4)) {
      parts.push(`• ${g}`);
    }
    const firstMissingRef = gapLines.find((g) =>
      /Available sources reference/i.test(g)
    );
    if (firstMissingRef) {
      const m = firstMissingRef.match(
        /Available sources reference (.+?), but that document/i
      );
      if (m?.[1]) {
        parts.push(
          `Adding ${m[1].trim()} would let Guardian answer more detailed questions from that source.`
        );
      }
    }
    parts.push("");
  }

  // --- Sources (available only) ---
  if (availableDocs.length || entity360.evidence.some((e) => e.documentName)) {
    parts.push("Sources");
    const seen = new Set<string>();
    for (const ev of entity360.evidence.slice(0, 5)) {
      if (!ev.documentId && !ev.documentName) continue;
      const label = ev.documentName ?? "Source in this Space";
      if (seen.has(label)) continue;
      seen.add(label);
      parts.push(`• ${label}`);
    }
  }

  return parts
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
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
