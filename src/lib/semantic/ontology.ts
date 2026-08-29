/**
 * Guardian Semantic Layer — Phase 1 canonical vocabulary.
 * Not a database ontology engine; centralized definitions for extraction prompts
 * and validation. Do not scatter entity definitions through prompts.
 */

export const ENTITY_TYPES = [
  "person",
  "organization",
  "agency",
  "opportunity",
  "contract",
  "project",
  "document",
  "event",
  "task",
  "deadline",
  "location",
  "product",
  "payment",
  "school",
  "topic",
] as const;

export type SemanticEntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_DESCRIPTIONS: Record<SemanticEntityType, string> = {
  person: "An individual known to the user.",
  organization:
    "A company, nonprofit, vendor, partner, employer, client, or other organization.",
  agency:
    "A government department, bureau, agency, office, or public entity.",
  opportunity:
    "A potential business, procurement, sales, partnership, grant, job, or other actionable opportunity.",
  contract: "A formal agreement for goods, services, or work.",
  project: "A scoped body of work with goals, owners, or deliverables.",
  document: "A named document, file, or written artifact of note.",
  event: "A meeting, call, visit, or other time-bound occurrence.",
  task: "A discrete action item or to-do.",
  deadline:
    "A date by which an action, submission, payment, response, or event must occur.",
  location: "A place, address, facility, or geographic area.",
  product: "A product, offering, or named capability.",
  payment: "A payment, invoice amount, fee, or monetary transfer.",
  school: "A school, district, university, or educational institution.",
  topic: "A subject, skill, role theme, or thematic concept worth tracking.",
};

export const RELATIONSHIP_TYPES = [
  "works_at",
  "works_with",
  "partner_of",
  "client_of",
  "supports",
  "supported",
  "issued_by",
  "pursuing",
  "awarded_to",
  "assigned_to",
  "due_on",
  "attended",
  "met_with",
  "introduced_to",
  "contact_for",
  "part_of",
  "related_to",
  "located_at",
  "depends_on",
  "mentioned_in",
  "parent_of",
  "associated_with",
] as const;

export type SemanticRelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_TYPE_DESCRIPTIONS: Record<
  SemanticRelationshipType,
  string
> = {
  works_at: "Person is employed by or works at an organization.",
  works_with: "Entities collaborate or work together.",
  partner_of: "Formal or stated partnership between organizations.",
  client_of: "One entity is a client of another.",
  supports: "Entity currently supports or assists another.",
  supported: "Entity has previously supported or assisted another.",
  issued_by: "Opportunity, contract, or document issued by an agency/org.",
  pursuing: "Entity is pursuing an opportunity or contract.",
  awarded_to: "Contract or award granted to an entity.",
  assigned_to: "Task or commitment assigned to a person/org.",
  due_on: "Task, opportunity, or commitment is due on a deadline.",
  attended: "Person attended an event.",
  met_with: "Person met with another person or organization.",
  introduced_to: "Person was introduced to another entity.",
  contact_for: "Person is a contact for an organization or matter.",
  part_of: "Entity is part of a larger entity.",
  related_to: "Generic association when no more specific type fits.",
  located_at: "Entity is located at a place.",
  depends_on: "Entity depends on another.",
  mentioned_in: "Entity is mentioned in a document or source.",
  parent_of: "Hierarchical parent relationship.",
  associated_with: "Loose but meaningful association supported by evidence.",
};

/** Common fact predicates for Phase 1 atomic assertions. */
export const FACT_PREDICATES = [
  "employee_count",
  "status",
  "amount",
  "vehicle",
  "deadline_date",
  "role",
  "title",
  "email",
  "phone",
  "url",
  "open_commitment",
  "action_promised",
  "action_assigned",
  "task_incomplete",
  "description",
] as const;

export type SemanticFactPredicate = (typeof FACT_PREDICATES)[number];

export const FACT_PREDICATE_DESCRIPTIONS: Record<
  SemanticFactPredicate,
  string
> = {
  employee_count: "Number of employees.",
  status: "Lifecycle or workflow status.",
  amount: "Monetary amount.",
  vehicle: "Contract vehicle or procurement vehicle.",
  deadline_date: "Normalized deadline datetime.",
  role: "Job role or function.",
  title: "Job or document title.",
  email: "Email address.",
  phone: "Phone number.",
  url: "Web URL.",
  open_commitment: "An outstanding promised action.",
  action_promised: "An action that was promised.",
  action_assigned: "An action that was assigned.",
  task_incomplete: "A task that remains incomplete.",
  description: "Free-text descriptive attribute.",
};

export const ENTITY_TYPE_SET = new Set<string>(ENTITY_TYPES);
export const RELATIONSHIP_TYPE_SET = new Set<string>(RELATIONSHIP_TYPES);
export const FACT_PREDICATE_SET = new Set<string>(FACT_PREDICATES);

export function isSemanticEntityType(value: string): value is SemanticEntityType {
  return ENTITY_TYPE_SET.has(value);
}

export function isSemanticRelationshipType(
  value: string
): value is SemanticRelationshipType {
  return RELATIONSHIP_TYPE_SET.has(value);
}

/** Prompt-ready ontology summary (centralized — do not duplicate in extract prompts). */
export function formatOntologyForPrompt(): string {
  const entities = ENTITY_TYPES.map(
    (t) => `- ${t}: ${ENTITY_TYPE_DESCRIPTIONS[t]}`
  ).join("\n");
  const relationships = RELATIONSHIP_TYPES.map(
    (t) => `- ${t}: ${RELATIONSHIP_TYPE_DESCRIPTIONS[t]}`
  ).join("\n");
  const facts = FACT_PREDICATES.map(
    (t) => `- ${t}: ${FACT_PREDICATE_DESCRIPTIONS[t]}`
  ).join("\n");
  return `ENTITY TYPES:\n${entities}\n\nRELATIONSHIP TYPES:\n${relationships}\n\nFACT PREDICATES:\n${facts}`;
}
