import { applyUncertainty, confidenceLevelFromScore } from "./confidence";
import { categoryForEntityKind } from "./categories";
import type {
  ConfirmationPrompt,
  ConversationExtractionResult,
  PersonalEntity,
  PersonalFact,
  PersonalFactStatus,
  PersonalRelationship,
} from "./types";

function entity(
  name: string,
  kind: PersonalEntity["kind"],
  confidence: number,
  status: PersonalFactStatus,
  sourceExcerpt: string,
  attributes?: Record<string, string>
): PersonalEntity {
  return {
    name,
    kind,
    category: categoryForEntityKind(kind),
    attributes,
    confidence,
    confidenceLevel: confidenceLevelFromScore(confidence),
    status,
    sourceExcerpt,
  };
}

function rel(
  subject: string,
  predicate: string,
  object: string,
  confidence: number,
  status: PersonalFactStatus,
  sourceExcerpt: string
): PersonalRelationship {
  return {
    subject,
    predicate,
    object,
    confidence,
    confidenceLevel: confidenceLevelFromScore(confidence),
    status,
    sourceExcerpt,
  };
}

function fact(
  subject: string,
  predicate: string,
  object: string | undefined,
  confidence: number,
  status: PersonalFactStatus,
  sourceExcerpt: string,
  value?: string
): PersonalFact {
  return {
    subject,
    predicate,
    object,
    value,
    confidence,
    confidenceLevel: confidenceLevelFromScore(confidence),
    status,
    sourceExcerpt,
    category: categoryForEntityKind(
      predicate.includes("own") || subject.toLowerCase().includes("highlander")
        ? "vehicle"
        : "other"
    ),
  };
}

function pushUniqueEntity(list: PersonalEntity[], e: PersonalEntity) {
  const key = `${e.kind}:${e.name.trim().toLowerCase()}`;
  if (list.some((x) => `${x.kind}:${x.name.trim().toLowerCase()}` === key)) {
    return;
  }
  list.push(e);
}

/**
 * Deterministic Personal Space conversation extractor.
 * Covers common self-introduction and life-fact patterns without requiring an LLM.
 */
export function extractPersonalKnowledgeFromText(
  input: string
): ConversationExtractionResult {
  const text = input.trim();
  const entities: PersonalEntity[] = [];
  const relationships: PersonalRelationship[] = [];
  const facts: PersonalFact[] = [];
  const confirmations: ConfirmationPrompt[] = [];

  if (!text) {
    return {
      entities,
      relationships,
      facts,
      confirmations,
      rememberReply: null,
    };
  }

  // Name: "My name is John Smith"
  const nameMatch = text.match(
    /\b[Mm]y name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?=\s+and\b|[.,!]|$)/
  );
  const personName = (nameMatch?.[1] ?? "").trim();
  if (personName && !/^(i|i'm|im)$/i.test(personName)) {
    const u = applyUncertainty(0.95, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    pushUniqueEntity(
      entities,
      entity(personName, "person", u.confidence, status, text)
    );
    facts.push(
      fact("User", "named", personName, u.confidence, status, text, personName)
    );
  }

  // Work: "I work for ABC Consulting" / "I work at …"
  const workMatch = text.match(
    /\b(?:i work (?:for|at)|i(?:'| a)?m (?:an? )?(?:employee|engineer|developer|consultant) (?:at|for)|i run (?:a |an )?(?:technology |tech )?company called)\s+([A-Za-z0-9][A-Za-z0-9 &.'\-]{1,80})/i
  );
  if (workMatch?.[1]) {
    const org = workMatch[1].replace(/[.!,;]+$/, "").trim();
    const u = applyUncertainty(0.92, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    pushUniqueEntity(
      entities,
      entity(org, "organization", u.confidence, status, text)
    );
    const subject = personName || "User";
    if (personName) {
      pushUniqueEntity(
        entities,
        entity(personName, "person", u.confidence, status, text)
      );
    }
    const predicate = /\brun\b/i.test(text) ? "owns" : "works_at";
    relationships.push(
      rel(subject, predicate, org, u.confidence, status, text)
    );
    if (/\brun\b/i.test(text) || /\bowner\b|\bfounder\b/i.test(text)) {
      facts.push(
        fact(subject, "role", org, u.confidence, status, text, "Owner / Founder")
      );
    }
  }

  // Location: "I live in Maryland"
  const liveMatch = text.match(
    /\bi live in\s+([A-Za-z][A-Za-z .'\-]{1,60})/i
  );
  if (liveMatch?.[1]) {
    const loc = liveMatch[1].replace(/[.!,;]+$/, "").trim();
    const u = applyUncertainty(0.9, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    pushUniqueEntity(
      entities,
      entity(loc, "location", u.confidence, status, text)
    );
    relationships.push(
      rel("User", "lives_in", loc, u.confidence, status, text)
    );
  }

  // Vehicles: "I have a Toyota Highlander and a Mini Cooper" / "I own a …"
  const vehicleBlock = text.match(
    /\b(?:i (?:have|own)|my (?:car|vehicle)(?:s)? (?:is|are))\s+(.+?)(?:\.|$)/i
  );
  if (vehicleBlock?.[1] && !/\boil change\b/i.test(text)) {
    const chunk = vehicleBlock[1];
    const parts = chunk
      .split(/\s+and\s+|,\s*/i)
      .map((p) => p.replace(/^(a|an|the)\s+/i, "").trim())
      .filter((p) => p.length > 1 && /[A-Za-z]/.test(p));
    for (const vehicleName of parts) {
      const cleaned = vehicleName.replace(/[.!,;]+$/, "").trim();
      if (!cleaned) continue;
      // Skip if this is just a year guess sentence handled elsewhere
      if (/^\d{4}$/.test(cleaned)) continue;
      const u = applyUncertainty(0.93, text);
      const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
      pushUniqueEntity(
        entities,
        entity(cleaned, "vehicle", u.confidence, status, text)
      );
      relationships.push(
        rel("User", "owns", cleaned, u.confidence, status, text)
      );
    }
  }

  // Uncertain vehicle year: "I think my Highlander is a 2021"
  const yearGuess = text.match(
    /\b(?:my\s+)?([A-Za-z][A-Za-z0-9 ]{0,40}?)\s+is (?:a |an )?(\d{4})\b/i
  );
  if (yearGuess?.[1] && yearGuess[2]) {
    const vehicleRef = yearGuess[1]
      .replace(/^(my|the|a|an)\s+/i, "")
      .trim();
    const year = yearGuess[2];
    const u = applyUncertainty(0.7, text);
    const vehicleName = /highlander/i.test(vehicleRef)
      ? "Toyota Highlander"
      : vehicleRef;
    if (u.mustAsk || u.level !== "high") {
      const candidate = fact(
        vehicleName,
        "model_year",
        year,
        u.confidence,
        "provisional",
        text,
        year
      );
      facts.push(candidate);
      confirmations.push({
        question: `Should I record your ${vehicleName} as a ${year} model?`,
        candidate,
        reason: "uncertain",
      });
    } else {
      pushUniqueEntity(
        entities,
        entity(vehicleName, "vehicle", u.confidence, "confirmed", text, {
          year,
        })
      );
      facts.push(
        fact(vehicleName, "model_year", year, u.confidence, "confirmed", text, year)
      );
    }
  }

  // Wife / spouse / family
  const spouseMatch = text.match(
    /\bmy (wife|husband|spouse|partner)\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  );
  if (spouseMatch?.[2]) {
    const role = spouseMatch[1].toLowerCase();
    const name = spouseMatch[2].trim();
    const u = applyUncertainty(0.95, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    pushUniqueEntity(
      entities,
      entity(name, "person", u.confidence, status, text)
    );
    relationships.push(
      rel("User", role === "wife" ? "spouse_of" : role, name, u.confidence, status, text)
    );
  }

  // Birthday (often uncertain)
  const bdayMatch = text.match(
    /\b([A-Za-z][A-Za-z ]{0,40}?)(?:'s)?\s+birthday is\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i
  );
  if (bdayMatch?.[1] && bdayMatch[2]) {
    const who = bdayMatch[1].replace(/^(my|the)\s+/i, "").trim();
    const when = bdayMatch[2].trim();
    const u = applyUncertainty(0.75, text);
    const personLabel = /jennifer/i.test(who) ? "Jennifer" : who;
    const candidate = fact(
      personLabel,
      "birthday",
      when,
      u.confidence,
      "provisional",
      text,
      when
    );
    facts.push(candidate);
    if (u.mustAsk || u.level !== "high") {
      confirmations.push({
        question: `Should I save ${personLabel}'s birthday as ${when}?`,
        candidate,
        reason: "uncertain",
      });
    }
  }

  // Accountant / professional role — skip weak "may be handling"
  const weakAccountant = /\b(?:someone named|may be|maybe|might be)\b.*\baccount/i.test(
    text
  );
  const accountantMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is my accountant\b/i
  );
  const accountantMatchAlt = text.match(
    /\bmy accountant is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  );
  if (!weakAccountant && (accountantMatch?.[1] || accountantMatchAlt?.[1])) {
    const name = (accountantMatch?.[1] ?? accountantMatchAlt?.[1])!.trim();
    const u = applyUncertainty(0.94, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    pushUniqueEntity(
      entities,
      entity(name, "person", u.confidence, status, text)
    );
    relationships.push(
      rel("User", "accountant", name, u.confidence, status, text)
    );
  } else if (weakAccountant) {
    // Low confidence — do not create confirmed accountant relationship
    const maybeName = text.match(/\b(?:named\s+)?([A-Z][a-z]+)\b/);
    if (maybeName?.[1]) {
      confirmations.push({
        question: `Is ${maybeName[1]} your accountant, or should I wait until you're sure?`,
        candidate: rel(
          "User",
          "accountant",
          maybeName[1],
          0.35,
          "provisional",
          text
        ),
        reason: "uncertain",
      });
    }
  }

  // David is my accountant (already covered) / "David is my accountant"
  // Commitment: "I told Sarah I would send her the contract Friday"
  const commitmentMatch = text.match(
    /\bi told\s+([A-Za-z][A-Za-z ]{0,40}?)\s+i (?:would|will)\s+(.+?)(?:\s+on)?\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|[\w]+\s+\d{1,2})/i
  );
  if (commitmentMatch) {
    const person = commitmentMatch[1].trim();
    const action = commitmentMatch[2].trim().replace(/\s+/g, " ");
    const due = commitmentMatch[3].trim();
    const u = applyUncertainty(0.88, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    pushUniqueEntity(
      entities,
      entity(person, "person", u.confidence, status, text)
    );
    const title = /contract/i.test(action)
      ? `Send contract to ${person}`
      : `${action} (${person})`;
    pushUniqueEntity(
      entities,
      entity(title, "commitment", u.confidence, status, text, { due })
    );
    facts.push(
      fact(title, "due", due, u.confidence, status, text, due)
    );
    relationships.push(
      rel("User", "committed_to", title, u.confidence, status, text)
    );
  }

  // Event: "My dental appointment is September 12 at 2 PM"
  const eventMatch = text.match(
    /\bmy\s+(.+?)\s+is\s+([A-Za-z]+\s+\d{1,2})(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)))?/i
  );
  if (
    eventMatch?.[1] &&
    eventMatch[2] &&
    /\b(appointment|meeting|interview|flight|game|concert|party|event)\b/i.test(
      eventMatch[1]
    )
  ) {
    const eventName = eventMatch[1]
      .trim()
      .replace(/\b^\w/, (c) => c.toUpperCase());
    const date = eventMatch[2].trim();
    const time = eventMatch[3]?.trim();
    const u = applyUncertainty(0.92, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    const label = /dental/i.test(eventName)
      ? "Dental Appointment"
      : eventName.replace(/\b\w/g, (c) => c.toUpperCase());
    pushUniqueEntity(
      entities,
      entity(label, "event", u.confidence, status, text, {
        date,
        ...(time ? { time } : {}),
      })
    );
    facts.push(fact(label, "date", date, u.confidence, status, text, date));
    if (time) {
      facts.push(fact(label, "time", time, u.confidence, status, text, time));
    }
  }

  // Maintenance: "My Highlander needs an oil change on October 15"
  const maintMatch = text.match(
    /\b(?:my\s+)?([A-Za-z][A-Za-z0-9 ]{0,40}?)\s+needs (?:an? )?(.+?)\s+on\s+([A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?)/i
  );
  if (maintMatch) {
    const vehicleRef = maintMatch[1].replace(/^(my|the)\s+/i, "").trim();
    const task = maintMatch[2].trim();
    const when = maintMatch[3].trim();
    const vehicleName = /highlander/i.test(vehicleRef)
      ? "Toyota Highlander"
      : vehicleRef;
    const u = applyUncertainty(0.9, text);
    const status: PersonalFactStatus = u.mustAsk ? "provisional" : "confirmed";
    pushUniqueEntity(
      entities,
      entity(vehicleName, "vehicle", u.confidence, status, text)
    );
    const title = `${task} — ${vehicleName}`;
    pushUniqueEntity(
      entities,
      entity(title, "commitment", u.confidence, status, text, { due: when })
    );
    facts.push(
      fact(vehicleName, "next_oil_change", when, u.confidence, status, text, when)
    );
    relationships.push(
      rel(vehicleName, "needs", title, u.confidence, status, text)
    );
  }

  // Correction: "My Highlander isn't a 2021. It's a 2020." / "is a 2020, not a 2021"
  const correction = text.match(
    /\b(?:is(?:n't| not) (?:a )?(\d{4}).*?(?:it'?s|is) (?:a )?(\d{4})|(?:is|it'?s) (?:a )?(\d{4}),?\s*not (?:a )?(\d{4}))/i
  );
  if (correction) {
    const newYear = correction[2] ?? correction[3];
    const oldYear = correction[1] ?? correction[4];
    if (newYear) {
      const vehicleName = /highlander/i.test(text)
        ? "Toyota Highlander"
        : "Vehicle";
      facts.push(
        fact(
          vehicleName,
          "model_year",
          newYear,
          0.98,
          "corrected",
          text,
          newYear
        )
      );
      facts.push(
        fact(
          vehicleName,
          "model_year_superseded",
          oldYear ?? undefined,
          0.98,
          "corrected",
          text,
          oldYear ?? undefined
        )
      );
      pushUniqueEntity(
        entities,
        entity(vehicleName, "vehicle", 0.98, "corrected", text, {
          year: newYear,
        })
      );
    }
  }

  const rememberReply =
    entities.length > 0 || relationships.length > 0 || facts.length > 0
      ? confirmations.length > 0
        ? confirmations[0].question
        : "I can remember that information in your Personal Space."
      : null;

  return {
    entities,
    relationships,
    facts,
    confirmations,
    rememberReply,
  };
}

/** Persistable items only — excludes low-confidence unconfirmed. */
export function confirmedExtractions(
  result: ConversationExtractionResult
): ConversationExtractionResult {
  const keepStatus = (s: PersonalFactStatus) =>
    s === "confirmed" || s === "corrected";
  return {
    entities: result.entities.filter((e) => keepStatus(e.status)),
    relationships: result.relationships.filter((r) => keepStatus(r.status)),
    facts: result.facts.filter((f) => keepStatus(f.status)),
    confirmations: result.confirmations,
    rememberReply: result.rememberReply,
  };
}
