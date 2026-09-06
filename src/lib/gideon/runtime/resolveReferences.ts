/**
 * Resolve conversational references (pronouns, "the solicitation", aliases)
 * into an explicit query for retrieval — without fabricating when ambiguous.
 */

import {
  entitiesOfType,
  findEntitiesByPhrase,
  mostRecentEntity,
} from "./entities";
import type {
  ActiveEntity,
  ActiveEntityType,
  ChatTurn,
  ReferenceResolution,
} from "./types";

const PRONOUN_PATTERNS: Array<{
  re: RegExp;
  types: ActiveEntityType[];
  label: string;
}> = [
  {
    re: /\b(we|our|us|the company)\b/i,
    types: ["organization", "client"],
    label: "we/our",
  },
  {
    re: /\b(they|them|their)\b/i,
    types: ["organization", "client", "person"],
    label: "they/them",
  },
  {
    re: /\bshe\b|\bher\b/i,
    types: ["person"],
    label: "she/her",
  },
  {
    re: /\bhe\b|\bhim\b|\bhis\b/i,
    types: ["person"],
    label: "he/him",
  },
  {
    re: /\b(the solicitation|that solicitation|this solicitation)\b/i,
    types: ["solicitation"],
    label: "the solicitation",
  },
  {
    re: /\b(the proposal|that proposal|this proposal|the draft)\b/i,
    types: ["proposal", "document"],
    label: "the proposal",
  },
  {
    re: /\b(that email|the email|this email)\b/i,
    types: ["document"],
    label: "that email",
  },
  {
    re: /\b(that document|the document|this document|the file)\b/i,
    types: ["document"],
    label: "that document",
  },
  {
    re: /\b(the previous one|the same one)\b/i,
    types: [
      "solicitation",
      "proposal",
      "document",
      "organization",
      "person",
      "project",
    ],
    label: "the previous one",
  },
  {
    re: /\b(the chamber)\b/i,
    types: ["organization", "client"],
    label: "the Chamber",
  },
  {
    re: /\b(the person I mentioned|that person)\b/i,
    types: ["person"],
    label: "the person I mentioned",
  },
];

const IT_THIS_THAT =
  /\b(it|this|that)\b/i;

function pickUnique(
  candidates: ActiveEntity[],
  types: ActiveEntityType[]
): { entity: ActiveEntity | null; ambiguous: boolean } {
  const pool = candidates.filter((e) => types.includes(e.type));
  if (pool.length === 0) {
    // fall back: any of preferred types from full set already filtered
    return { entity: null, ambiguous: false };
  }
  if (pool.length === 1) return { entity: pool[0]!, ambiguous: false };

  // Same type group — if two people, ambiguous
  const byType = new Map<string, ActiveEntity[]>();
  for (const e of pool) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }
  for (const type of types) {
    const list = byType.get(type) ?? [];
    if (list.length === 1) return { entity: list[0]!, ambiguous: false };
    if (list.length > 1) {
      // Prefer most recently referenced if confidence gap is clear
      const sorted = [...list].sort((a, b) => {
        const t =
          (b.last_referenced_at ?? "").localeCompare(a.last_referenced_at ?? "");
        if (t !== 0) return t;
        return b.confidence - a.confidence;
      });
      const top = sorted[0]!;
      const second = sorted[1]!;
      const topTime = top.last_referenced_at ?? "";
      const secondTime = second.last_referenced_at ?? "";
      if (topTime && secondTime && topTime > secondTime) {
        return { entity: top, ambiguous: false };
      }
      if (top.confidence - second.confidence >= 0.15) {
        return { entity: top, ambiguous: false };
      }
      return { entity: null, ambiguous: true };
    }
  }
  return { entity: mostRecentEntity(pool) , ambiguous: false };
}

function describeEntity(e: ActiveEntity): string {
  if (e.canonical_id && e.name && !e.name.includes(e.canonical_id)) {
    return `${e.name} (${e.canonical_id})`;
  }
  return e.canonical_id || e.name;
}

export function resolveReferences(args: {
  message: string;
  activeEntities: ActiveEntity[];
  recentMessages?: ChatTurn[];
}): ReferenceResolution {
  const { message, activeEntities } = args;
  const bindings: ReferenceResolution["bindings"] = [];
  let ambiguous = false;
  let clarificationPrompt: string | null = null;

  if (!message.trim()) {
    return {
      resolvedMessage: message,
      success: false,
      ambiguous: false,
      clarificationPrompt: null,
      bindings: [],
    };
  }

  // Alias phrases like "the Chamber" that match known entities
  for (const entity of activeEntities) {
    for (const alias of entity.aliases ?? []) {
      if (alias.length < 3) continue;
      const re = new RegExp(
        `\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      );
      if (re.test(message) && !bindings.some((b) => b.entityName === entity.name)) {
        bindings.push({
          phrase: alias,
          entityName: entity.name,
          entityType: entity.type,
        });
      }
    }
    // Direct name mention
    if (
      entity.name.length >= 3 &&
      new RegExp(
        `\\b${entity.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      ).test(message)
    ) {
      if (!bindings.some((b) => b.entityName === entity.name)) {
        bindings.push({
          phrase: entity.name,
          entityName: entity.name,
          entityType: entity.type,
        });
      }
    }
  }

  for (const pattern of PRONOUN_PATTERNS) {
    if (!pattern.re.test(message)) continue;
    // "she" pattern uses alternation carefully
    const match = message.match(pattern.re);
    const phrase = match?.[0] ?? pattern.label;

    // Chamber special-case
    if (pattern.label === "the Chamber") {
      const hits = findEntitiesByPhrase(activeEntities, "Chamber");
      const orgHits = hits.filter(
        (e) => e.type === "organization" || e.type === "client"
      );
      if (orgHits.length === 1) {
        bindings.push({
          phrase,
          entityName: orgHits[0]!.name,
          entityType: orgHits[0]!.type,
        });
        continue;
      }
      if (orgHits.length > 1) {
        ambiguous = true;
        clarificationPrompt = `Which organization did you mean: ${orgHits
          .map((e) => e.name)
          .join(" or ")}?`;
        continue;
      }
    }

    const { entity, ambiguous: amb } = pickUnique(activeEntities, pattern.types);
    if (amb) {
      ambiguous = true;
      const pool = entitiesOfType(activeEntities, pattern.types[0]!).concat(
        pattern.types.slice(1).flatMap((t) => entitiesOfType(activeEntities, t))
      );
      const names = [...new Set(pool.map((e) => e.name))].slice(0, 3);
      clarificationPrompt = `Which ${pattern.types[0]} did you mean${
        names.length ? `: ${names.join(" or ")}` : ""
      }?`;
      continue;
    }
    if (entity) {
      bindings.push({
        phrase,
        entityName: entity.name,
        entityType: entity.type,
      });
    }
  }

  // it / this / that → prefer solicitation, proposal, document, then topic
  if (IT_THIS_THAT.test(message)) {
    const preferred: ActiveEntityType[] = [
      "solicitation",
      "proposal",
      "document",
      "project",
      "generic_topic",
    ];
    const { entity, ambiguous: amb } = pickUnique(activeEntities, preferred);
    if (amb) {
      ambiguous = true;
      clarificationPrompt =
        clarificationPrompt ??
        "Which item are you referring to? Please name it.";
    } else if (
      entity &&
      !bindings.some((b) => b.entityName === entity.name)
    ) {
      const m = message.match(IT_THIS_THAT);
      bindings.push({
        phrase: m?.[0] ?? "it",
        entityName: entity.name,
        entityType: entity.type,
      });
    }
  }

  if (ambiguous && clarificationPrompt) {
    return {
      resolvedMessage: message,
      success: false,
      ambiguous: true,
      clarificationPrompt,
      bindings,
    };
  }

  if (!bindings.length) {
    // No pronouns — still enrich with active entities for short follow-ups
    const looksLikeFollowUp =
      message.length < 100 &&
      /\b(are we|what are we|did they|make it|help me respond|what was|biggest issue)\b/i.test(
        message
      );
    if (!looksLikeFollowUp || !activeEntities.length) {
      return {
        resolvedMessage: message,
        success: false,
        ambiguous: false,
        clarificationPrompt: null,
        bindings: [],
      };
    }
  }

  const org =
    bindings.find((b) => b.entityType === "organization" || b.entityType === "client") ??
    null;
  const sol =
    bindings.find((b) => b.entityType === "solicitation") ??
    null;
  const person = bindings.find((b) => b.entityType === "person") ?? null;
  const proposal =
    bindings.find(
      (b) => b.entityType === "proposal" || b.entityType === "document"
    ) ?? null;

  const orgEntity = org
    ? activeEntities.find((e) => e.name === org.entityName)
    : mostRecentEntity(activeEntities, ["organization", "client"]);
  const solEntity = sol
    ? activeEntities.find((e) => e.name === sol.entityName)
    : mostRecentEntity(activeEntities, ["solicitation"]);
  const personEntity = person
    ? activeEntities.find((e) => e.name === person.entityName)
    : null;
  const proposalEntity = proposal
    ? activeEntities.find((e) => e.name === proposal.entityName)
    : mostRecentEntity(activeEntities, ["proposal", "document"]);

  let resolved = message.trim();

  // Qualification pattern
  if (
    /\b(are we qualified|are we eligible|what are we missing|can we (bid|respond|qualify))\b/i.test(
      resolved
    ) &&
    (orgEntity || solEntity)
  ) {
    const who = orgEntity ? describeEntity(orgEntity) : "we";
    const about = solEntity ? describeEntity(solEntity) : "the current opportunity";
    if (/what are we missing/i.test(resolved)) {
      resolved = `What is ${who} missing to respond to ${about}?`;
    } else {
      resolved = `Is ${who} qualified to respond to ${about}?`;
    }
  } else if (
    /\b(help me respond|draft|submit|prepare).{0,40}\b/i.test(resolved) &&
    (orgEntity || solEntity)
  ) {
    const about = solEntity ? describeEntity(solEntity) : "the current opportunity";
    const who = orgEntity ? describeEntity(orgEntity) : "us";
    resolved = `Help ${who} draft a response related to ${about}.`;
  } else if (
    /\b(did they|have they|they contact)\b/i.test(resolved) &&
    orgEntity
  ) {
    resolved = resolved
      .replace(/\bthey\b/gi, orgEntity.name)
      .replace(/\bthem\b/gi, orgEntity.name)
      .replace(/\btheir\b/gi, `${orgEntity.name}'s`);
  } else if (/\b(she|her)\b/i.test(resolved) && personEntity) {
    resolved = resolved
      .replace(/\bshe\b/gi, personEntity.name)
      .replace(/\bher\b/gi, personEntity.name);
  } else if (/\b(he|him|his)\b/i.test(resolved) && personEntity) {
    resolved = resolved
      .replace(/\bhe\b/gi, personEntity.name)
      .replace(/\bhim\b/gi, personEntity.name)
      .replace(/\bhis\b/gi, `${personEntity.name}'s`);
  } else if (
    /\b(make it shorter|shorten it|edit it|revise it)\b/i.test(resolved) &&
    proposalEntity
  ) {
    resolved = `Make the ${describeEntity(proposalEntity)} shorter.`;
  } else if (bindings.length) {
    // Generic: append context clause
    const parts: string[] = [];
    if (orgEntity) parts.push(`organization=${describeEntity(orgEntity)}`);
    if (solEntity) parts.push(`solicitation=${describeEntity(solEntity)}`);
    if (personEntity) parts.push(`person=${describeEntity(personEntity)}`);
    if (proposalEntity && !solEntity) {
      parts.push(`subject=${describeEntity(proposalEntity)}`);
    }
    if (parts.length) {
      resolved = `${resolved} [context: ${parts.join("; ")}]`;
    }
  }

  // Enrich with active solicitation title + id when only one is present
  if (solEntity?.canonical_id && !resolved.includes(solEntity.canonical_id)) {
    if (!/BPM/i.test(resolved)) {
      resolved = `${resolved} (${solEntity.canonical_id})`;
    }
  }

  return {
    resolvedMessage: resolved,
    success: resolved !== message.trim() || bindings.length > 0,
    ambiguous: false,
    clarificationPrompt: null,
    bindings,
  };
}
