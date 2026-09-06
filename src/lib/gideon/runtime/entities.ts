/**
 * Pure helpers for active entity tracking (dedupe, aliases, merge).
 */

import type { ActiveEntity, ActiveEntityType } from "./types";
import { MAX_ACTIVE_ENTITIES } from "./types";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function entityKey(entity: Pick<ActiveEntity, "type" | "name" | "canonical_id">): string {
  const id = entity.canonical_id?.trim();
  if (id) return `${entity.type}::id::${norm(id)}`;
  return `${entity.type}::name::${norm(entity.name)}`;
}

export function entityMatchesAlias(
  entity: ActiveEntity,
  phrase: string
): boolean {
  const p = norm(phrase);
  if (!p) return false;
  if (norm(entity.name) === p) return true;
  if (entity.canonical_id && norm(entity.canonical_id) === p) return true;
  return (entity.aliases ?? []).some((a) => norm(a) === p || norm(a).includes(p) || p.includes(norm(a)));
}

/** Find entities whose name/alias contains or equals the phrase. */
export function findEntitiesByPhrase(
  entities: ActiveEntity[],
  phrase: string
): ActiveEntity[] {
  const p = norm(phrase);
  if (!p) return [];
  return entities.filter((e) => {
    if (norm(e.name) === p || norm(e.name).includes(p) || p.includes(norm(e.name))) {
      return true;
    }
    if (e.canonical_id && (norm(e.canonical_id) === p || p.includes(norm(e.canonical_id)))) {
      return true;
    }
    return (e.aliases ?? []).some(
      (a) => norm(a) === p || norm(a).includes(p) || p.includes(norm(a))
    );
  });
}

export function mergeEntity(
  existing: ActiveEntity,
  incoming: ActiveEntity,
  nowIso: string
): ActiveEntity {
  const aliases = new Set<string>();
  for (const a of existing.aliases ?? []) {
    if (a.trim()) aliases.add(a.trim());
  }
  for (const a of incoming.aliases ?? []) {
    if (a.trim()) aliases.add(a.trim());
  }
  if (norm(incoming.name) !== norm(existing.name)) {
    aliases.add(incoming.name.trim());
  }
  if (norm(existing.name) !== norm(incoming.name) && existing.name.trim()) {
    // keep primary name as the higher-confidence one
  }
  const preferIncoming = incoming.confidence >= existing.confidence;
  return {
    type: preferIncoming ? incoming.type : existing.type,
    name: preferIncoming ? incoming.name : existing.name,
    canonical_id:
      incoming.canonical_id?.trim() ||
      existing.canonical_id?.trim() ||
      null,
    source_id: incoming.source_id?.trim() || existing.source_id?.trim() || null,
    confidence: Math.max(existing.confidence, incoming.confidence),
    aliases: [...aliases].filter(
      (a) => norm(a) !== norm(preferIncoming ? incoming.name : existing.name)
    ),
    last_referenced_at: nowIso,
  };
}

function findMergeKey(
  map: Map<string, ActiveEntity>,
  e: ActiveEntity
): string | null {
  for (const [k, v] of map) {
    if (
      e.canonical_id &&
      v.canonical_id &&
      norm(e.canonical_id) === norm(v.canonical_id)
    ) {
      return k;
    }
    if (norm(e.name) === norm(v.name) && e.type === v.type) {
      return k;
    }
    // Same solicitation family: BPM id + titled solicitation
    if (e.type === "solicitation" && v.type === "solicitation") {
      if (
        (e.canonical_id && entityMatchesAlias(v, e.canonical_id)) ||
        (v.canonical_id && entityMatchesAlias(e, v.canonical_id)) ||
        entityMatchesAlias(v, e.name) ||
        entityMatchesAlias(e, v.name)
      ) {
        return k;
      }
    }
    // Alias collision: "Chamber" matches Olney Chamber
    if (entityMatchesAlias(v, e.name) || entityMatchesAlias(e, v.name)) {
      if (
        e.type === v.type ||
        e.type === "generic_topic" ||
        v.type === "generic_topic"
      ) {
        return k;
      }
    }
  }
  return null;
}

export function upsertActiveEntities(
  current: ActiveEntity[],
  incoming: ActiveEntity[],
  nowIso: string = new Date().toISOString()
): ActiveEntity[] {
  const map = new Map<string, ActiveEntity>();
  for (const e of current) {
    map.set(entityKey(e), { ...e });
  }
  for (const e of incoming) {
    if (!e.name?.trim()) continue;
    const key = entityKey(e);
    const mergedKey = map.has(key) ? key : findMergeKey(map, e) ?? key;
    const existing = map.get(mergedKey);
    if (existing) {
      map.set(mergedKey, mergeEntity(existing, e, nowIso));
    } else {
      map.set(key, {
        ...e,
        name: e.name.trim(),
        last_referenced_at: nowIso,
        aliases: e.aliases ?? [],
      });
    }
  }
  const list = [...map.values()].sort(
    (a, b) =>
      (b.last_referenced_at ?? "").localeCompare(a.last_referenced_at ?? "") ||
      b.confidence - a.confidence
  );
  return list.slice(0, MAX_ACTIVE_ENTITIES);
}

export function entitiesOfType(
  entities: ActiveEntity[],
  type: ActiveEntityType
): ActiveEntity[] {
  return entities.filter((e) => e.type === type);
}

export function mostRecentEntity(
  entities: ActiveEntity[],
  types?: ActiveEntityType[]
): ActiveEntity | null {
  const pool = types?.length
    ? entities.filter((e) => types.includes(e.type))
    : entities;
  if (!pool.length) return null;
  return [...pool].sort((a, b) =>
    (b.last_referenced_at ?? "").localeCompare(a.last_referenced_at ?? "")
  )[0]!;
}

/** Heuristic extraction of entities from a user message. */
export function extractEntitiesFromMessage(
  message: string,
  nowIso: string = new Date().toISOString()
): ActiveEntity[] {
  const found: ActiveEntity[] = [];
  const text = message.trim();
  if (!text) return found;

  // Solicitation / BPM ids
  for (const m of text.matchAll(/\bBPM[\s#-]*(\d{4,})\b/gi)) {
    const id = `BPM ${m[1]}`;
    found.push({
      type: "solicitation",
      name: id,
      canonical_id: id,
      confidence: 0.98,
      aliases: [m[0]!, `BPM${m[1]}`, id],
      last_referenced_at: nowIso,
    });
  }

  // "Statewide Cybersecurity Resources" style solicitation titles
  const solTitle = text.match(
    /\b(?:the\s+)?(Statewide\s+Cybersecurity\s+Resources)\b/i
  );
  if (solTitle?.[1]) {
    found.push({
      type: "solicitation",
      name: solTitle[1],
      canonical_id: found.find((e) => e.type === "solicitation")?.canonical_id ?? null,
      confidence: 0.95,
      aliases: ["the solicitation", "cybersecurity solicitation", "Maryland cybersecurity"],
      last_referenced_at: nowIso,
    });
  }

  const solicitationPhrase = text.match(
    /\b(?:find|locate|review|about|regarding)\s+(?:the\s+)?(.+?\s+solicitation)\b/i
  );
  if (solicitationPhrase?.[1]) {
    const name = solicitationPhrase[1].trim();
    if (name.length > 3 && name.length < 120) {
      found.push({
        type: "solicitation",
        name,
        confidence: 0.85,
        aliases: ["the solicitation", "that solicitation"],
        last_referenced_at: nowIso,
      });
    }
  }

  // Known orgs / chambers
  const chamber = text.match(
    /\b((?:Olney\s+)?Chamber(?:\s+of\s+Commerce)?)\b/i
  );
  if (chamber?.[1]) {
    const name = /olney/i.test(chamber[1])
      ? "Olney Chamber of Commerce"
      : chamber[1];
    found.push({
      type: "organization",
      name,
      confidence: 0.97,
      aliases: ["Chamber", "the Chamber", "Olney Chamber", "they", name],
      last_referenced_at: nowIso,
    });
  }

  const nm2 = text.match(/\b(NM2TECH|NM2\s*Tech)\b/i);
  if (nm2?.[1]) {
    found.push({
      type: "organization",
      name: "NM2TECH",
      confidence: 0.99,
      aliases: ["NM2 Tech", "we", "our", "the company", nm2[1]],
      last_referenced_at: nowIso,
    });
  }

  // "Who is Jaime?" / "Tell me about Sarah"
  const whoIs = text.match(
    /\b(?:who\s+is|who'?s|tell\s+me\s+about|what\s+about)\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?)\b/i
  );
  if (
    whoIs?.[1] &&
    !/^(chamber|solicitation|proposal|document|maryland|cybersecurity|who|what|where|when|why|how)$/i.test(
      whoIs[1]
    )
  ) {
    const personName = whoIs[1].replace(/\b\w/g, (c) => c.toUpperCase());
    found.push({
      type: "person",
      name: personName,
      confidence: 0.9,
      aliases: [personName],
      last_referenced_at: nowIso,
    });
  }

  // "Jaime is a contact..." — skip interrogatives ("Who is…")
  const nameIs = text.match(
    /^([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s+is\b/
  );
  const PERSON_STOP =
    /^(Who|What|Where|When|Why|How|This|That|There|Here|She|He|They|It)$/;
  if (
    nameIs?.[1] &&
    !PERSON_STOP.test(nameIs[1]) &&
    !found.some((e) => e.type === "person" && norm(e.name) === norm(nameIs[1]!))
  ) {
    found.push({
      type: "person",
      name: nameIs[1],
      confidence: 0.88,
      aliases: [nameIs[1]],
      last_referenced_at: nowIso,
    });
  }

  // Proposal context
  const proposal = text.match(
    /\b(?:the\s+)?([A-Z][A-Za-z0-9 &'-]{2,40}?)\s+proposal\b/
  );
  if (proposal?.[1] && !/^(this|that|our|my|the)$/i.test(proposal[1])) {
    found.push({
      type: "proposal",
      name: `${proposal[1].trim()} proposal`,
      confidence: 0.92,
      aliases: [
        "the proposal",
        "that proposal",
        "it",
        "the draft",
        proposal[1].trim(),
      ],
      last_referenced_at: nowIso,
    });
  } else if (/\b(proposal|draft)\b/i.test(text) && /\b(review|shorten|draft|edit)\b/i.test(text)) {
    // generic proposal mention
    found.push({
      type: "proposal",
      name: "current proposal",
      confidence: 0.7,
      aliases: ["the proposal", "that proposal", "it", "the draft"],
      last_referenced_at: nowIso,
    });
  }

  // Document
  const doc = text.match(
    /\b(?:that|the|this)\s+(email|document|file|pdf|contract|handbook)\b/i
  );
  if (doc?.[1]) {
    found.push({
      type: "document",
      name: doc[1],
      confidence: 0.75,
      aliases: [`that ${doc[1]}`, `the ${doc[1]}`, `this ${doc[1]}`],
      last_referenced_at: nowIso,
    });
  }

  return upsertActiveEntities([], found, nowIso);
}

/** Infer NM2TECH-style "we" organization when qualification / respond language appears. */
export function inferImplicitOrganization(
  message: string,
  existing: ActiveEntity[],
  nowIso: string
): ActiveEntity[] {
  if (!/\b(we|our|us)\b/i.test(message)) return [];
  if (entitiesOfType(existing, "organization").length) return [];
  // Default org for capture/qualification flows when solicitation is active
  if (
    entitiesOfType(existing, "solicitation").length ||
    /\b(qualif|respond|submit|proposal|solicitation|BPM)\b/i.test(message)
  ) {
    return [
      {
        type: "organization",
        name: "NM2TECH",
        confidence: 0.85,
        aliases: ["we", "our", "us", "the company"],
        last_referenced_at: nowIso,
      },
    ];
  }
  return [];
}
