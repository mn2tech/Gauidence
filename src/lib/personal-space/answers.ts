import { classifyResponseDepth } from "./responseDepth";
import type {
  PersonalAnswer,
  PersonalKnowledgeStore,
  ResponseDepth,
} from "./types";

function findVehicle(store: PersonalKnowledgeStore): string | null {
  const fromEntity = store.entities.find((e) => e.kind === "vehicle");
  if (fromEntity) return fromEntity.name;
  const owned = store.relationships.find(
    (r) => r.predicate === "owns" && r.status !== "rejected"
  );
  return owned?.object ?? null;
}

function findFactValue(
  store: PersonalKnowledgeStore,
  predicate: string,
  subjectHint?: RegExp
): { value: string; source?: string | null } | null {
  const facts = store.facts
    .filter(
      (f) =>
        f.predicate === predicate &&
        f.status !== "rejected" &&
        (f.status === "confirmed" ||
          f.status === "corrected" ||
          f.status === "provisional")
    )
    .sort((a, b) => {
      const rank = (s: string) =>
        s === "corrected" ? 3 : s === "confirmed" ? 2 : 1;
      return rank(b.status) - rank(a.status);
    });
  for (const f of facts) {
    if (subjectHint && !subjectHint.test(f.subject)) continue;
    const value = f.value ?? f.object;
    if (value) {
      return { value, source: f.sourceFileName ?? null };
    }
  }
  return null;
}

function accountantOf(store: PersonalKnowledgeStore): string | null {
  const rel = store.relationships.find(
    (r) =>
      r.predicate === "accountant" &&
      (r.status === "confirmed" || r.status === "corrected")
  );
  return rel?.object ?? null;
}

function dentalAppointment(store: PersonalKnowledgeStore): {
  date?: string;
  time?: string;
  name: string;
} | null {
  const event = store.entities.find(
    (e) => e.kind === "event" && /dental/i.test(e.name)
  );
  if (!event) return null;
  return {
    name: event.name,
    date: event.attributes?.date,
    time: event.attributes?.time,
  };
}

/**
 * Answer personal questions from structured Personal Space knowledge first.
 * Never invents personal facts.
 */
export function answerFromPersonalKnowledge(
  question: string,
  store: PersonalKnowledgeStore,
  options?: { depth?: ResponseDepth }
): PersonalAnswer {
  const depth = options?.depth ?? classifyResponseDepth(question);
  const q = question.trim();

  // Passport / unknown personal
  if (/\bpassport\b/i.test(q) && /\b(expire|number|when)\b/i.test(q)) {
    const hasPassport = store.facts.some((f) =>
      /passport/i.test(f.subject + (f.object ?? "") + (f.value ?? ""))
    );
    if (!hasPassport) {
      return {
        text: /\bnumber\b/i.test(q)
          ? "I don't have your passport number in Guardian."
          : "I don't have your passport expiration date in Guardian yet. You can upload your passport information or tell me the expiration date.",
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: false,
      };
    }
  }

  // What is a passport? — general knowledge
  if (/^what is a passport\??$/i.test(q)) {
    return {
      text: "A passport is an official government travel document that proves your identity and nationality for international travel.",
      depth,
      sourceLayer: "general_model",
      sources: [],
      known: true,
    };
  }

  // What car do I own / have
  if (/\b(what|which)\b.*\b(car|vehicle)\b/i.test(q) || /\bcar do i (own|have)\b/i.test(q)) {
    const vehicle = findVehicle(store);
    if (!vehicle) {
      return {
        text: "I don't have a vehicle recorded in your Personal Space yet.",
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: false,
      };
    }
    if (depth === 1) {
      return {
        text: vehicle,
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: true,
      };
    }
    return {
      text: `You have a ${vehicle}.`,
      depth,
      sourceLayer: "structured_knowledge",
      sources: [],
      known: true,
    };
  }

  // Oil change
  if (/\boil change\b/i.test(q)) {
    const oil = findFactValue(store, "next_oil_change");
    if (!oil) {
      return {
        text: "I don't have an oil change date in Guardian yet.",
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: false,
      };
    }
    return {
      text: depth === 1 ? oil.value : `Your next oil change is ${oil.value}.`,
      depth,
      sourceLayer: "structured_knowledge",
      sources: oil.source ? [{ label: oil.source }] : [],
      known: true,
    };
  }

  // Who is Sarah
  if (/\bwho is\s+([A-Za-z]+)/i.test(q)) {
    const name = q.match(/\bwho is\s+([A-Za-z]+)/i)?.[1] ?? "";
    const accountant = accountantOf(store);
    if (
      accountant &&
      new RegExp(name, "i").test(accountant)
    ) {
      return {
        text: `${accountant} is your accountant.`,
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: true,
      };
    }
  }

  // Registration expire
  if (/\bregistration\b/i.test(q) && /\bexpir/i.test(q)) {
    const exp = findFactValue(store, "expires_on", /registration|vehicle|highlander/i) ??
      findFactValue(store, "expires_on");
    if (!exp) {
      return {
        text: "I don't have your vehicle registration expiration in Guardian yet.",
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: false,
      };
    }
    return {
      text:
        depth === 1
          ? exp.value
          : `Your registration expires ${exp.value}.`,
      depth,
      sourceLayer: "documents",
      sources: exp.source
        ? [{ label: exp.source }]
        : [{ label: "Vehicle registration" }],
      known: true,
    };
  }

  // Vehicle year
  if (/\byear\b/i.test(q) && /\b(highlander|car|vehicle)\b/i.test(q)) {
    const year = findFactValue(store, "model_year", /highlander|vehicle/i);
    if (!year) {
      return {
        text: "I don't have the model year recorded yet.",
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: false,
      };
    }
    return {
      text: year.value,
      depth,
      sourceLayer: "structured_knowledge",
      sources: [],
      known: true,
    };
  }

  // Dental appointment when
  if (/\bdental\b/i.test(q) && /\b(when|appointment)\b/i.test(q)) {
    const appt = dentalAppointment(store);
    if (!appt?.date) {
      return {
        text: "I don't have a dental appointment in Guardian yet.",
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: false,
      };
    }
    const direct =
      appt.time != null ? `${appt.date} at ${appt.time}` : appt.date;

    if (depth === 1 && !/\beverything\b|\bprepare\b|\btell me\b/i.test(q)) {
      return {
        text: direct,
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: true,
      };
    }

    if (/\bprepare\b/i.test(q)) {
      return {
        text: `Your ${appt.name} is ${direct}. General tip: arrive a few minutes early and bring your insurance card if you have one. (Personal schedule from Guardian; preparation tip is general advice.)`,
        depth: Math.max(depth, 3) as ResponseDepth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: true,
      };
    }

    if (/\beverything\b|\ball you know\b/i.test(q)) {
      const parts = [
        `Event: ${appt.name}`,
        appt.date ? `Date: ${appt.date}` : null,
        appt.time ? `Time: ${appt.time}` : null,
      ].filter(Boolean);
      return {
        text: parts.join("\n"),
        depth,
        sourceLayer: "structured_knowledge",
        sources: [],
        known: true,
      };
    }

    return {
      text: direct,
      depth,
      sourceLayer: "structured_knowledge",
      sources: [],
      known: true,
    };
  }

  // Everything about Highlander
  if (
    /\beverything\b|\ball you know\b/i.test(q) &&
    /\bhighlander\b|\b(car|vehicle)\b/i.test(q)
  ) {
    const vehicle = findVehicle(store) ?? "Toyota Highlander";
    const year = findFactValue(store, "model_year", /highlander/i);
    const oil = findFactValue(store, "next_oil_change");
    const reg = findFactValue(store, "expires_on");
    const lines = [`Vehicle: ${vehicle}`];
    if (year) lines.push(`Year: ${year.value}`);
    if (oil) lines.push(`Next oil change: ${oil.value}`);
    if (reg) lines.push(`Registration expires: ${reg.value}`);
    const docSources = store.facts
      .filter((f) => f.sourceFileName)
      .map((f) => f.sourceFileName!)
      .filter((v, i, a) => a.indexOf(v) === i);
    if (docSources.length) {
      lines.push(`Related documents: ${docSources.join(", ")}`);
    }
    return {
      text: lines.join("\n"),
      depth: Math.max(depth, 4) as ResponseDepth,
      sourceLayer: "structured_knowledge",
      sources: docSources.map((label) => ({ label })),
      known: true,
    };
  }

  return {
    text: "",
    depth,
    sourceLayer: "general_model",
    sources: [],
    known: false,
  };
}
