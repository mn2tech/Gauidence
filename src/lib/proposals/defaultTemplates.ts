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
      "A focused 2–3 week redesign sprint to improve {{company_name}}'s homepage — trust, messaging, CTAs, and conversion paths — based on your website review.",
    default_introduction: [
      "This sprint addresses the highest-impact homepage improvements identified in your review — trust signals, clearer messaging, stronger calls to action, and conversion paths.",
      "",
      "Timeline: 2–3 weeks total from kickoff (see phases below). Final homepage scope is confirmed during kickoff.",
      "",
      "Client responsibilities",
      "• Provide brand assets, homepage copy, and site/CMS access before or at kickoff",
      "• Name one decision-maker for consolidated feedback",
      "• Return feedback within 3 business days per review round",
      "",
      "What's not included",
      "Interior pages, net-new copywriting beyond homepage edits, photography, logo/brand design, hosting/domain fees, and post-launch change requests. Full out-of-scope list is in Terms.",
      "",
      "After launch",
      "Many clients continue with interior pages or a monthly care plan — see optional add-ons below.",
    ].join("\n"),
    default_terms: [
      "PAYMENT",
      "• 50% deposit due to schedule kickoff; 50% balance due at launch",
      "• Invoices are net 7 days",
      "• Pricing valid for 30 days from this proposal date",
      "",
      "ASSESSMENT CREDIT",
      "• If you purchased the Website & Conversion Assessment, the $99 fee credits toward this sprint when you approve within 30 days of assessment delivery (the date your written plan and walkthrough are delivered)",
      "",
      "REVISIONS",
      "• One round of revisions included per major homepage section: hero, trust/testimonials, services, about/team, and CTA/contact",
      "• Additional rounds, new sections, or scope changes are billed separately",
      "",
      "CLIENT RESPONSIBILITIES",
      "• Timely delivery of content, brand assets, and site/CMS access",
      "• Feedback within 3 business days per review round",
      "• Schedule shifts caused by client delays will be communicated in writing",
      "",
      "OUT OF SCOPE",
      "• Interior or additional pages beyond the homepage",
      "• Net-new copywriting beyond light homepage edits",
      "• Photography, videography, or logo/brand identity work",
      "• Hosting, domain, or third-party subscription fees",
      "• Post-launch edits, A/B tests, or ongoing SEO (available as add-ons)",
      "",
      "NEXT STEP",
      "• Click Approve proposal below to accept these terms",
      "• We will send a 50% deposit invoice within 1 business day; the sprint is scheduled when the deposit is received",
    ].join("\n"),
    default_line_items: [
      {
        title: "Homepage Redesign Sprint",
        description: [
          "Homepage UX and content strategy aligned to your review.",
          "Design concepts and responsive build.",
          "Trust and conversion improvements (testimonials, team, CTAs, forms).",
          "One revision round per major section: hero, trust/testimonials, services, about/team, CTA/contact.",
          "QA, launch support, and handoff documentation.",
          "2–3 weeks total from kickoff.",
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
          "QA, go-live, team walkthrough, and documentation. (2–3 business days; 2–3 weeks total)",
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
      {
        title: "Out of scope (reference)",
        description:
          "Interior pages, new copy packages, photography, logo work, hosting, and post-launch changes — not included in this sprint.",
        sortOrder: 3,
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
          "Post-launch updates, security patches, minor content edits, and monthly performance check-in.",
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
