import type { AdvisorServiceCatalogItem } from "./types";

/** Default Guardian solutions seeded per business on first assessment. */
export const DEFAULT_ADVISOR_CATALOG: Omit<
  AdvisorServiceCatalogItem,
  "id" | "business_profile_id" | "is_active"
>[] = [
  {
    service_key: "website_security_hardening",
    name: "Website Security Hardening",
    category: "security",
    description:
      "HTTPS, security headers, vulnerability remediation, and monitoring setup.",
    estimated_hours: 16,
    hourly_rate_cents: 17500,
    minimum_price_cents: 250000,
    maximum_price_cents: 800000,
    subscription_monthly_cents: null,
  },
  {
    service_key: "seo_optimization",
    name: "SEO & Discoverability Program",
    category: "marketing",
    description:
      "Technical SEO, metadata, content structure, and local search improvements.",
    estimated_hours: 24,
    hourly_rate_cents: 15000,
    minimum_price_cents: 300000,
    maximum_price_cents: 1200000,
    subscription_monthly_cents: 150000,
  },
  {
    service_key: "knowledge_base",
    name: "Guardian Knowledge Base",
    category: "ai",
    description:
      "AI-powered knowledge engine for staff and customers with document search.",
    estimated_hours: 40,
    hourly_rate_cents: 17500,
    minimum_price_cents: 500000,
    maximum_price_cents: 2500000,
    subscription_monthly_cents: 49900,
  },
  {
    service_key: "ai_phone_agent",
    name: "AI Phone & Intake Agent",
    category: "ai",
    description:
      "24/7 AI call handling, FAQ, routing, and lead capture integrated with Guardian.",
    estimated_hours: 32,
    hourly_rate_cents: 17500,
    minimum_price_cents: 450000,
    maximum_price_cents: 1800000,
    subscription_monthly_cents: 79900,
  },
  {
    service_key: "client_portal",
    name: "Client Portal & Requests",
    category: "operations",
    description:
      "Branded client vault, requests, proposals, and document sharing.",
    estimated_hours: 28,
    hourly_rate_cents: 15000,
    minimum_price_cents: 350000,
    maximum_price_cents: 1500000,
    subscription_monthly_cents: 39900,
  },
  {
    service_key: "performance_optimization",
    name: "Website Performance Optimization",
    category: "website",
    description:
      "Speed, Core Web Vitals, image optimization, and caching improvements.",
    estimated_hours: 20,
    hourly_rate_cents: 15000,
    minimum_price_cents: 200000,
    maximum_price_cents: 900000,
    subscription_monthly_cents: null,
  },
  {
    service_key: "accessibility_compliance",
    name: "Accessibility & Compliance Review",
    category: "compliance",
    description:
      "WCAG-oriented accessibility fixes and compliance documentation.",
    estimated_hours: 24,
    hourly_rate_cents: 16500,
    minimum_price_cents: 280000,
    maximum_price_cents: 1100000,
    subscription_monthly_cents: null,
  },
  {
    service_key: "proposal_automation",
    name: "Proposal & Sales Automation",
    category: "sales",
    description:
      "Guardian proposals, templates, pricing, and client acceptance workflows.",
    estimated_hours: 16,
    hourly_rate_cents: 15000,
    minimum_price_cents: 180000,
    maximum_price_cents: 700000,
    subscription_monthly_cents: 29900,
  },
];

export function calculateCatalogPrice(item: {
  estimated_hours: number;
  hourly_rate_cents: number;
  minimum_price_cents: number;
  maximum_price_cents: number | null;
}): number {
  const raw = Math.round(item.estimated_hours * item.hourly_rate_cents);
  const min = item.minimum_price_cents;
  const max = item.maximum_price_cents ?? raw * 2;
  return Math.min(Math.max(raw, min), max);
}

export const INDUSTRY_PLAYBOOKS: Record<
  string,
  { label: string; solutionKeys: string[] }
> = {
  fire_department: {
    label: "Fire Department",
    solutionKeys: [
      "knowledge_base",
      "ai_phone_agent",
      "client_portal",
      "proposal_automation",
    ],
  },
  healthcare: {
    label: "Healthcare",
    solutionKeys: [
      "knowledge_base",
      "ai_phone_agent",
      "accessibility_compliance",
      "client_portal",
    ],
  },
  environmental: {
    label: "Environmental Services",
    solutionKeys: [
      "knowledge_base",
      "client_portal",
      "proposal_automation",
      "ai_phone_agent",
    ],
  },
  church: {
    label: "Church / Nonprofit",
    solutionKeys: [
      "knowledge_base",
      "ai_phone_agent",
      "client_portal",
      "seo_optimization",
    ],
  },
  legal: {
    label: "Legal / Professional Services",
    solutionKeys: [
      "knowledge_base",
      "proposal_automation",
      "client_portal",
      "website_security_hardening",
    ],
  },
  professional_services: {
    label: "Professional Services",
    solutionKeys: [
      "proposal_automation",
      "knowledge_base",
      "client_portal",
      "seo_optimization",
    ],
  },
  restaurant: {
    label: "Restaurant / Retail",
    solutionKeys: [
      "seo_optimization",
      "performance_optimization",
      "ai_phone_agent",
      "client_portal",
    ],
  },
  general: {
    label: "General Business",
    solutionKeys: [
      "website_security_hardening",
      "seo_optimization",
      "knowledge_base",
      "proposal_automation",
    ],
  },
};
