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
export const DEFAULT_HOMEPAGE_SPRINT_TEMPLATE_NAME = "Homepage Redesign Sprint";
export const DEFAULT_KNOWLEDGE_BASE_TEMPLATE_NAME = "Guardian Knowledge Base";

export const DEFAULT_PROPOSAL_TEMPLATE_SEEDS: ProposalTemplateSeed[] = [
  {
    name: DEFAULT_ASSESSMENT_TEMPLATE_NAME,
    description:
      "$99 website and conversion assessment. Fee credited toward implementation within 30 days of delivery.",
    default_title: "{{company_name}} — Website & Conversion Assessment",
    default_summary:
      "A focused review of {{company_name}}'s website ({{website_url}}) with a written priority plan and walkthrough.",
    default_introduction: [
      "We'll review your website findings together and prioritize what will move the needle for trust, clarity, and conversions.",
      "",
      "This assessment includes everything from your free website review, plus a written plan and a short walkthrough call.",
    ].join("\n"),
    default_terms: [
      "The $99 assessment fee is fully credited toward an implementation project (e.g. Homepage Redesign Sprint) if you approve that proposal within 30 days of assessment delivery — the date your written priority plan and walkthrough are delivered.",
      "",
      "Pricing valid for 30 days from this proposal date.",
      "",
      "Next step: approve this assessment proposal below. We will confirm scheduling and send any payment link for the $99 fee.",
    ].join("\n"),
    default_line_items: [
      {
        title: "Website & Conversion Assessment",
        description: [
          "Everything in your free website review package.",
          "Written priority plan based on your site review.",
          "15-minute walkthrough call or Loom recording.",
          "$99 fully credited toward implementation if you approve within 30 days of assessment delivery.",
        ].join("\n"),
        quantity: 1,
        unitLabel: "assessment",
        unitPriceCents: 9900,
      },
    ],
    default_timeline: [
      {
        title: "Kickoff & access",
        description:
          "Confirm goals, analytics access, and review materials. (1–2 business days)",
        sortOrder: 0,
      },
      {
        title: "Assessment delivery",
        description:
          "Written priority plan and walkthrough of recommendations. (2–3 business days from kickoff; 3–5 business days total)",
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
    name: DEFAULT_HOMEPAGE_SPRINT_TEMPLATE_NAME,
    description:
      "Design and build homepage improvements for trust, clarity, and conversions. 2–3 week fixed-scope sprint.",
    default_title: "{{company_name}} — Homepage Redesign Sprint",
    default_summary:
      "A fixed-scope homepage redesign sprint for {{company_name}} ({{website_url}}), based on your paid website review. Improve trust, messaging, CTAs, and conversion paths — approximately 3 weeks from kickoff.",
    default_introduction: [
      "Prepared by NM2TECH (Next Move) for {{company_name}}.",
      "",
      "This sprint addresses the highest-impact homepage improvements from your website review — trust signals, clearer messaging, stronger calls to action, and conversion paths. Work is limited to the homepage unless you add optional services below.",
      "",
      "Timeline: approximately 3 weeks from kickoff (see phases below), contingent on timely feedback and content from your team. Final scope is confirmed at kickoff.",
      "",
      "Your team provides",
      "• Brand assets, existing content, testimonials, and site/CMS access at kickoff",
      "• One decision-maker for consolidated feedback",
      "• Feedback within 3 business days at each review point",
      "• If assets or feedback are delayed, the timeline shifts — we will confirm revised dates in writing",
      "",
      "Not included",
      "• Interior pages beyond the homepage",
      "• Copywriting beyond homepage content edits",
      "• Custom photography or illustration",
      "• Logo or full brand identity work",
      "• Hosting and domain fees",
      "• Third-party licenses or subscriptions",
      "• Ongoing maintenance after handoff",
      "(These can be quoted separately — see optional add-ons.)",
      "",
      "After launch, interior pages and a monthly optimization plan are available if you want to keep building on this work.",
    ].join("\n"),
    default_terms: [
      "PAYMENT",
      "• Total fixed fee: $4,500",
      "• 50% ($2,250) due at signing to schedule kickoff",
      "• 50% ($2,250) due at launch",
      "• Invoices are net 7 days",
      "• Pricing valid for 30 days from {{proposal_date}}",
      "",
      "ASSESSMENT CREDIT",
      "• If you purchased the Website & Conversion Assessment ($99), that fee credits toward this sprint when purchased by {{assessment_credit_deadline}}",
      "",
      "REVISIONS",
      "• One round of revisions included per major homepage section, defined as: hero; trust/testimonials; services; about/team; and contact/CTA",
      "• Additional rounds, new sections, or scope changes are billed separately",
      "",
      "CHANGES & CANCELLATION",
      "• Material scope changes require written approval and may affect fee and timeline",
      "• If you cancel after kickoff, fees for work completed to date remain due; the signing payment is non-refundable once discovery has started",
      "",
      "NEXT STEP",
      "• Click Approve proposal below to accept these terms",
      "• We will send the 50% signing invoice within 1 business day; kickoff is scheduled when payment is received",
    ].join("\n"),
    default_line_items: [
      {
        title: "Homepage Redesign Sprint",
        description: [
          "Homepage UX and content strategy aligned to your review.",
          "Design concepts and responsive build.",
          "Trust and conversion improvements (testimonials, team, CTAs, forms).",
          "One revision round per major section: hero, trust/testimonials, services, about/team, contact/CTA.",
          "QA, launch support, and handoff documentation.",
          "Approximately 3 weeks from kickoff.",
        ].join("\n"),
        quantity: 1,
        unitLabel: "project",
        unitPriceCents: 450000,
      },
    ],
    default_timeline: [
      {
        title: "Discovery & kickoff",
        description:
          "Align on scope, brand, success metrics, and client asset handoff. (2–3 business days)",
        sortOrder: 0,
      },
      {
        title: "Design & build",
        description:
          "Homepage redesign, content updates, development, and one revision round per major section. (7–10 business days)",
        sortOrder: 1,
      },
      {
        title: "Launch & handoff",
        description:
          "QA, go-live, team walkthrough, and documentation. (2–3 business days; approximately 3 weeks total from kickoff)",
        sortOrder: 2,
      },
    ],
    default_deliverables: [
      {
        title: "Homepage redesign",
        description:
          "Updated layout, messaging, and visual design for the homepage only.",
        sortOrder: 0,
      },
      {
        title: "Trust & conversion upgrades",
        description:
          "Testimonials, team/about, quote paths, and form improvements within homepage scope.",
        sortOrder: 1,
      },
      {
        title: "Launch & documentation",
        description: "Deployed homepage plus handoff notes for your team.",
        sortOrder: 2,
      },
    ],
    default_addons: [
      {
        title: "Interior pages — design & build (up to 3 pages)",
        description:
          "Extend the new homepage look to key interior pages (e.g. services, about, contact).",
        quantity: 1,
        unitLabel: "package",
        unitPriceCents: 250000,
        optional: true,
      },
      {
        title: "Website care plan — monthly",
        description:
          "Post-launch updates, security patches, minor content edits, and monthly optimization check-in.",
        quantity: 1,
        unitLabel: "month",
        unitPriceCents: 29900,
        optional: true,
      },
    ],
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
  {
    name: DEFAULT_KNOWLEDGE_BASE_TEMPLATE_NAME,
    description:
      "AI-powered knowledge engine for SOPs, compliance docs, policies, and team search — with Guardian Ask Gideon.",
    default_title: "{{company_name}} — Guardian Knowledge Base",
    default_summary:
      "Centralize {{company_name}}'s SOPs, compliance documents, and policies in one searchable knowledge base your staff and clients can trust.",
    default_introduction: [
      "{{company_name}} runs on institutional knowledge — procedures, compliance requirements, and how work actually gets done.",
      "",
      "Guardian Knowledge Base turns scattered PDFs, Word docs, and shared drives into a structured library with AI search. Your team finds the right answer in seconds instead of digging through email or outdated folders.",
      "",
      "Example content we help you organize:",
      "• Standard Operating Procedures (SOPs) — onboarding, daily operations, equipment use, closing checklists",
      "• Compliance & regulatory — HIPAA privacy practices, OSHA safety plans, licensing renewals, audit evidence",
      "• Policies & handbooks — employee handbook, code of conduct, IT acceptable use, PTO and leave",
      "• Training & job aids — role-specific guides, troubleshooting steps, customer intake scripts",
      "• Client-facing FAQs — service explanations, forms, and request instructions",
    ].join("\n"),
    default_terms:
      "Pricing valid for 30 days. Document migration scope confirmed at kickoff. Optional monthly subscription for hosting, updates, and support after launch.",
    default_line_items: [
      {
        title: "Guardian Knowledge Base — Implementation",
        description: [
          "Knowledge base setup in your Guardian business vault.",
          "Document import and structuring (PDF, Word, and existing files).",
          "SOP, compliance, and policy libraries with clear categories.",
          "AI-powered search and Ask Gideon over your approved content.",
          "Role-based access so staff see what they need — not everything.",
          "Team training and launch handoff.",
        ].join("\n"),
        quantity: 1,
        unitLabel: "project",
        unitPriceCents: 500000,
      },
    ],
    default_timeline: [
      {
        title: "Discovery & content audit",
        description:
          "Inventory existing SOPs, compliance docs, and policies; agree on library structure.",
        sortOrder: 0,
      },
      {
        title: "Import & organization",
        description:
          "Upload, tag, and structure documents into SOP, compliance, policy, and training collections.",
        sortOrder: 1,
      },
      {
        title: "AI search & training",
        description:
          "Enable Guardian search, validate answers against source docs, train your team.",
        sortOrder: 2,
      },
      {
        title: "Launch & handoff",
        description: "Go-live, documentation, and ongoing content ownership plan.",
        sortOrder: 3,
      },
    ],
    default_deliverables: [
      {
        title: "SOP library",
        description:
          "Structured standard operating procedures — e.g. opening/closing checklists, equipment maintenance, client intake, escalation paths.",
        sortOrder: 0,
      },
      {
        title: "Compliance document hub",
        description:
          "Central place for regulatory and audit materials — e.g. HIPAA policies, OSHA logs, license certificates, inspection reports.",
        sortOrder: 1,
      },
      {
        title: "Policies & employee handbook",
        description:
          "Handbook sections, HR policies, safety rules, and acknowledgment tracking guidance.",
        sortOrder: 2,
      },
      {
        title: "Training & job aids",
        description:
          "Quick-reference guides, troubleshooting steps, and role-based onboarding packets.",
        sortOrder: 3,
      },
      {
        title: "AI search (Ask Gideon)",
        description:
          "Search across approved documents with cited answers — no guessing from outdated copies.",
        sortOrder: 4,
      },
      {
        title: "Launch training",
        description: "Walkthrough for admins and staff on finding and maintaining content.",
        sortOrder: 5,
      },
    ],
    default_addons: [
      {
        title: "Knowledge Base — monthly care plan",
        description:
          "Hosting, content updates, quarterly review, and priority support for your knowledge library.",
        quantity: 1,
        unitLabel: "month",
        unitPriceCents: 49900,
        optional: true,
      },
      {
        title: "Additional document migration batch",
        description: "Import and structure up to 50 additional documents beyond kickoff scope.",
        quantity: 1,
        unitLabel: "batch",
        unitPriceCents: 75000,
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
