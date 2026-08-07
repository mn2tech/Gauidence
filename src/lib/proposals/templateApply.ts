import { randomUUID } from "node:crypto";
import type {
  ProposalDeliverable,
  ProposalLineItem,
  ProposalTemplate,
  ProposalTimelineItem,
} from "./types";

export type TemplatePersonalization = {
  company_name?: string;
  website_url?: string;
  client_name?: string;
  assessment_credit_deadline?: string;
  proposal_date?: string;
};

function personalizeText(
  value: string | null | undefined,
  vars: TemplatePersonalization
): string {
  if (!value) return "";
  return value
    .replaceAll("{{company_name}}", vars.company_name ?? "your company")
    .replaceAll("{{website_url}}", vars.website_url ?? "your website")
    .replaceAll("{{client_name}}", vars.client_name ?? "you")
    .replaceAll(
      "{{assessment_credit_deadline}}",
      vars.assessment_credit_deadline ?? "the deadline in this proposal"
    )
    .replaceAll(
      "{{proposal_date}}",
      vars.proposal_date ??
        new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
    );
}

function cloneLineItems(
  items: ProposalLineItem[],
  vars: TemplatePersonalization
): ProposalLineItem[] {
  return items.map((item) => ({
    ...item,
    id: randomUUID(),
    title: personalizeText(item.title, vars),
    description: item.description
      ? personalizeText(item.description, vars)
      : undefined,
  }));
}

function cloneTimeline(
  items: ProposalTimelineItem[],
  vars: TemplatePersonalization
): ProposalTimelineItem[] {
  return items.map((item) => ({
    ...item,
    id: randomUUID(),
    title: personalizeText(item.title, vars),
    description: item.description
      ? personalizeText(item.description, vars)
      : undefined,
  }));
}

function cloneDeliverables(
  items: ProposalDeliverable[],
  vars: TemplatePersonalization
): ProposalDeliverable[] {
  return items.map((item) => ({
    ...item,
    id: randomUUID(),
    title: personalizeText(item.title, vars),
    description: item.description
      ? personalizeText(item.description, vars)
      : undefined,
  }));
}

export type AppliedProposalTemplate = {
  templateId: string;
  title: string;
  summary: string;
  introduction: string;
  terms: string;
  lineItems: ProposalLineItem[];
  timeline: ProposalTimelineItem[];
  deliverables: ProposalDeliverable[];
  addons: ProposalLineItem[];
};

/** Apply a stored proposal template with fresh ids and optional placeholders. */
export function applyProposalTemplate(
  template: ProposalTemplate,
  vars: TemplatePersonalization = {}
): AppliedProposalTemplate {
  return {
    templateId: template.id,
    title:
      personalizeText(template.default_title, vars) ||
      personalizeText(template.name, vars),
    summary: personalizeText(template.default_summary, vars),
    introduction: personalizeText(template.default_introduction, vars),
    terms: personalizeText(template.default_terms, vars),
    lineItems: cloneLineItems(template.default_line_items, vars),
    timeline: cloneTimeline(template.default_timeline, vars),
    deliverables: cloneDeliverables(template.default_deliverables, vars),
    addons: cloneLineItems(template.default_addons, vars),
  };
}

export function proposalTemplateTotalCents(template: ProposalTemplate): number {
  return template.default_line_items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
    0
  );
}
