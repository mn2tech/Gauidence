import type {
  ProposalDeliverable,
  ProposalLineItem,
  ProposalTimelineItem,
} from "./types";

/** Static seed content for proposal templates (no ids — assigned on insert). */
export type ProposalTemplateSeed = {
  name: string;
  description: string;
  default_title: string;
  default_summary: string;
  default_introduction: string;
  default_terms: string;
  default_line_items: Omit<ProposalLineItem, "id">[];
  default_timeline: Omit<ProposalTimelineItem, "id">[];
  default_deliverables: Omit<ProposalDeliverable, "id">[];
  default_addons: Omit<ProposalLineItem, "id">[];
};

export const DEFAULT_ASSESSMENT_TEMPLATE_NAME = "Website & Conversion Assessment";

export const DEFAULT_PROPOSAL_TEMPLATE_SEEDS: ProposalTemplateSeed[] = [
  {
    name: DEFAULT_ASSESSMENT_TEMPLATE_NAME,
    description:
      "$99 website and conversion assessment. Fee credited toward implementation within 30 days.",
    default_title: "{{company_name}} — Website & Conversion Assessment",
    default_summary:
      "A focused review of {{company_name}}'s website ({{website_url}}) with a written priority plan and walkthrough.",
    default_introduction: [
      "We'll review your website findings together and prioritize what will move the needle for trust, clarity, and conversions.",
      "",
      "This assessment includes everything from your free website review, plus a written plan and a short walkthrough call.",
    ].join("\n"),
    default_terms:
      "The $99 assessment fee is fully credited toward implementation if you proceed within 30 days. Pricing valid for 30 days.",
    default_line_items: [
      {
        title: "Website & Conversion Assessment",
        description: [
          "Everything in your free website review package.",
          "Written priority plan based on your site review.",
          "15-minute walkthrough call or Loom recording.",
          "$99 fully credited toward implementation if you proceed within 30 days.",
        ].join("\n"),
        quantity: 1,
        unitLabel: "assessment",
        unitPriceCents: 9900,
      },
    ],
    default_timeline: [
      {
        title: "Kickoff & access",
        description: "Confirm goals, analytics access, and review materials.",
        sortOrder: 0,
      },
      {
        title: "Assessment delivery",
        description: "Written priority plan and walkthrough of recommendations.",
        sortOrder: 1,
      },
    ],
    default_deliverables: [
      {
        title: "Website review summary",
        description: "Score, key findings, and prioritized upgrade list.",
        sortOrder: 0,
      },
      {
        title: "Written priority plan",
        description: "What to fix first and recommended implementation path.",
        sortOrder: 1,
      },
      {
        title: "Walkthrough call or Loom",
        description: "15-minute review of results with your team.",
        sortOrder: 2,
      },
    ],
    default_addons: [],
  },
  {
    name: "Homepage Redesign Sprint",
    description:
      "Design and build homepage improvements for trust, clarity, and conversions.",
    default_title: "{{company_name}} — Homepage Redesign Sprint",
    default_summary:
      "A focused redesign sprint to improve {{company_name}}'s homepage based on your website review.",
    default_introduction: [
      "This sprint addresses the highest-impact homepage improvements identified in your review — trust signals, clearer messaging, stronger calls to action, and conversion paths.",
      "",
      "Scope is confirmed during kickoff. Assessment fee applies as credit when purchased within 30 days.",
    ].join("\n"),
    default_terms:
      "Final scope confirmed at kickoff. One round of revision included per major section. Pricing valid for 30 days.",
    default_line_items: [
      {
        title: "Homepage Redesign Sprint",
        description: [
          "Homepage UX and content strategy aligned to your review.",
          "Design concepts and responsive build.",
          "Trust and conversion improvements (testimonials, team, CTAs, forms).",
          "QA, launch support, and handoff documentation.",
        ].join("\n"),
        quantity: 1,
        unitLabel: "project",
        unitPriceCents: 450000,
      },
    ],
    default_timeline: [
      {
        title: "Discovery & kickoff",
        description: "Align on scope, brand, and success metrics.",
        sortOrder: 0,
      },
      {
        title: "Design & build",
        description: "Homepage redesign, content updates, and development.",
        sortOrder: 1,
      },
      {
        title: "Launch & handoff",
        description: "QA, go-live, and team training.",
        sortOrder: 2,
      },
    ],
    default_deliverables: [
      {
        title: "Homepage redesign",
        description: "Updated layout, messaging, and visual design.",
        sortOrder: 0,
      },
      {
        title: "Trust & conversion upgrades",
        description: "Testimonials, team/about, quote paths, and form improvements as scoped.",
        sortOrder: 1,
      },
      {
        title: "Launch & documentation",
        description: "Deployed site plus handoff notes for your team.",
        sortOrder: 2,
      },
    ],
    default_addons: [],
  },
  {
    name: "SEO & Discoverability Program",
    description: "Technical SEO, metadata, and content structure improvements.",
    default_title: "{{company_name}} — SEO & Discoverability Program",
    default_summary:
      "Improve how {{company_name}} appears in search and how clearly your services are understood online.",
    default_introduction:
      "We'll improve technical SEO, on-page metadata, content structure, and local discoverability so more of the right visitors find {{company_name}}.",
    default_terms: "Pricing valid for 30 days. Monthly subscription optional after initial program.",
    default_line_items: [
      {
        title: "SEO & Discoverability Program",
        description: [
          "Technical SEO audit and fixes.",
          "Page titles, meta descriptions, and heading structure.",
          "Content and internal linking recommendations.",
          "Plain-language navigation labels where needed.",
        ].join("\n"),
        quantity: 1,
        unitLabel: "project",
        unitPriceCents: 300000,
      },
    ],
    default_timeline: [
      {
        title: "Audit & plan",
        description: "Baseline review and prioritized SEO roadmap.",
        sortOrder: 0,
      },
      {
        title: "Implementation",
        description: "On-page and technical improvements.",
        sortOrder: 1,
      },
      {
        title: "Reporting",
        description: "Summary of changes and next-step recommendations.",
        sortOrder: 2,
      },
    ],
    default_deliverables: [
      {
        title: "SEO audit report",
        description: "Prioritized issues and fixes.",
        sortOrder: 0,
      },
      {
        title: "On-page optimizations",
        description: "Metadata, headings, and content structure updates.",
        sortOrder: 1,
      },
    ],
    default_addons: [
      {
        title: "Ongoing SEO monitoring",
        description: "Monthly reporting and tune-ups.",
        quantity: 1,
        unitLabel: "month",
        unitPriceCents: 150000,
        optional: true,
      },
    ],
  },
];

export function templateSeedTotalCents(seed: ProposalTemplateSeed): number {
  const base = seed.default_line_items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
    0
  );
  return base;
}
