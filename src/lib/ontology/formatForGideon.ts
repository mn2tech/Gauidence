import type { OntologyContext } from "./types";

/**
 * Compact one-hop ontology block for Gideon's system prompt.
 * Returns "(none)" when empty so the prompt section stays stable.
 */
export function formatOntologyForGideon(ctx: OntologyContext): string {
  if (
    ctx.matchedEntities.length === 0 &&
    ctx.relationships.length === 0 &&
    ctx.evidence.length === 0 &&
    ctx.paths.length === 0
  ) {
    return "(none)";
  }

  const nameOf = (id: string) => ctx.entityNames[id] ?? "Unknown entity";
  const blocks: string[] = [];

  if (ctx.matchedEntities.length > 0) {
    blocks.push("MATCHED ENTITIES:");
    for (const entity of ctx.matchedEntities.slice(0, 5)) {
      const conf =
        entity.confidence != null
          ? ` | confidence:${Number(entity.confidence).toFixed(2)}`
          : "";
      const desc = entity.description
        ? ` — ${entity.description.slice(0, 120)}`
        : "";
      blocks.push(
        `- ${entity.name} (${entity.entity_type})${desc}${conf}`
      );
    }
  }

  if (ctx.relationships.length > 0) {
    blocks.push("", "RELATIONSHIPS (one-hop):");
    for (const rel of ctx.relationships.slice(0, 10)) {
      const conf =
        rel.confidence != null
          ? ` | confidence:${Number(rel.confidence).toFixed(2)}`
          : "";
      blocks.push(
        `- ${nameOf(rel.source_entity_id)} —[${rel.relationship_type}]→ ${nameOf(rel.target_entity_id)}${conf}`
      );
    }
  }

  if (ctx.paths.length > 0) {
    blocks.push("", "PATHS (up to 2-hop):");
    for (const path of ctx.paths.slice(0, 6)) {
      blocks.push(`- ${path.label}`);
    }
  }

  if (ctx.evidence.length > 0) {
    blocks.push("", "EVIDENCE (cite when using ontology facts):");
    for (const ev of ctx.evidence.slice(0, 5)) {
      const text = (ev.evidence_text ?? "").trim().slice(0, 120);
      if (!text) continue;
      blocks.push(`- "${text}"`);
    }
  }

  return blocks.length ? blocks.join("\n") : "(none)";
}

/**
 * User-facing answer when the LLM returns blank but ontology matched.
 */
export function buildOntologyAnswerFallback(ontologyBlock: string): string | null {
  const trimmed = ontologyBlock.trim();
  if (!trimmed || trimmed === "(none)") return null;

  const entityLines: string[] = [];
  const relationshipLines: string[] = [];
  let section: "none" | "entities" | "relationships" | "paths" | "evidence" =
    "none";

  for (const raw of trimmed.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("MATCHED ENTITIES")) {
      section = "entities";
      continue;
    }
    if (line.startsWith("RELATIONSHIPS")) {
      section = "relationships";
      continue;
    }
    if (line.startsWith("PATHS")) {
      section = "paths";
      continue;
    }
    if (line.startsWith("EVIDENCE")) {
      section = "evidence";
      continue;
    }
    if (!line.startsWith("- ")) continue;
    const item = line.slice(2).trim();
    if (section === "entities") {
      const name = item.replace(/\s*\|.*$/, "").trim();
      if (name) entityLines.push(name);
    } else if (section === "relationships" || section === "paths") {
      const clean = item.replace(/\s*\|.*$/, "").trim();
      if (clean) relationshipLines.push(clean);
    }
  }

  if (!entityLines.length && !relationshipLines.length) return null;

  const parts: string[] = ["## FROM YOUR ONTOLOGY", ""];
  if (entityLines.length) {
    parts.push("Matching entities:");
    for (const e of entityLines.slice(0, 5)) parts.push(`- ${e}`);
  }
  if (relationshipLines.length) {
    if (entityLines.length) parts.push("");
    parts.push("Connections:");
    for (const r of relationshipLines.slice(0, 8)) parts.push(`- ${r}`);
  }
  parts.push("");
  parts.push(
    "Ask a full question if you want me to pull more detail from your documents."
  );
  return parts.join("\n");
}

