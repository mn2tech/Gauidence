import type { WebsiteDiscovery } from "./discovery";

export type AnalyzerFinding = {
  analyzer: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  business_impact: string;
  recommendation: string;
  raw_data?: Record<string, unknown>;
};

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

/** Deterministic security surface review from HTTP response. */
export function runSecurityAnalyzer(
  discovery: WebsiteDiscovery
): AnalyzerFinding[] {
  const findings: AnalyzerFinding[] = [];
  const h = discovery.headers;

  if (!discovery.isHttps) {
    findings.push({
      analyzer: "security",
      category: "transport",
      severity: "critical",
      title: "Site not served over HTTPS",
      description: "The website does not use a secure HTTPS connection.",
      business_impact:
        "Visitors and search engines may distrust the site; data in transit is exposed.",
      recommendation: "Enable SSL/TLS and redirect all HTTP traffic to HTTPS.",
    });
  }

  const missingHeaders = SECURITY_HEADERS.filter((key) => !h[key]);
  if (missingHeaders.length > 0) {
    findings.push({
      analyzer: "security",
      category: "headers",
      severity: missingHeaders.length >= 4 ? "high" : "medium",
      title: "Missing security headers",
      description: `Missing: ${missingHeaders.join(", ")}.`,
      business_impact:
        "Increased risk of clickjacking, MIME sniffing, and cross-site attacks.",
      recommendation:
        "Configure security headers on the web server or CDN (HSTS, CSP, X-Frame-Options, etc.).",
      raw_data: { missingHeaders },
    });
  }

  if (discovery.statusCode >= 400) {
    findings.push({
      analyzer: "security",
      category: "availability",
      severity: "high",
      title: `Homepage returned HTTP ${discovery.statusCode}`,
      description: "The homepage did not load successfully.",
      business_impact: "Prospects cannot reach the business online.",
      recommendation: "Fix server errors and monitor uptime.",
    });
  }

  return findings;
}

/** Website quality, SEO, and UX signals from HTML discovery. */
export function runWebsiteAnalyzer(
  discovery: WebsiteDiscovery
): AnalyzerFinding[] {
  const findings: AnalyzerFinding[] = [];

  if (!discovery.title?.trim()) {
    findings.push({
      analyzer: "website",
      category: "seo",
      severity: "high",
      title: "Missing page title",
      description: "The homepage has no <title> tag.",
      business_impact: "Lower search rankings and unclear browser tab labels.",
      recommendation: "Add a descriptive, keyword-rich page title under 60 characters.",
    });
  } else if (discovery.title.length > 60) {
    findings.push({
      analyzer: "website",
      category: "seo",
      severity: "low",
      title: "Page title may be too long",
      description: `Title is ${discovery.title.length} characters.`,
      business_impact: "Search results may truncate the title.",
      recommendation: "Shorten the title to ~50–60 characters.",
    });
  }

  if (!discovery.metaDescription?.trim()) {
    findings.push({
      analyzer: "website",
      category: "seo",
      severity: "medium",
      title: "Missing meta description",
      description: "No meta description found on the homepage.",
      business_impact: "Reduced click-through from search results.",
      recommendation: "Add a compelling meta description (120–160 characters).",
    });
  }

  if (!discovery.h1?.trim()) {
    findings.push({
      analyzer: "website",
      category: "content",
      severity: "medium",
      title: "Missing H1 heading",
      description: "The homepage has no primary H1 heading.",
      business_impact: "Weaker content hierarchy for users and search engines.",
      recommendation: "Add a clear H1 that states what the business offers.",
    });
  }

  if (discovery.loadTimeMs > 3000) {
    findings.push({
      analyzer: "website",
      category: "performance",
      severity: "medium",
      title: "Slow homepage load time",
      description: `Homepage took ${(discovery.loadTimeMs / 1000).toFixed(1)}s to load.`,
      business_impact: "Higher bounce rates and lower conversion.",
      recommendation:
        "Optimize images, caching, and hosting; target under 2.5s load time.",
      raw_data: { loadTimeMs: discovery.loadTimeMs },
    });
  }

  if (discovery.textSample.length < 200) {
    findings.push({
      analyzer: "website",
      category: "content",
      severity: "medium",
      title: "Thin homepage content",
      description: "Very little readable text on the homepage.",
      business_impact: "Visitors may not understand the value proposition quickly.",
      recommendation:
        "Add clear value proposition, services, proof points, and calls to action.",
    });
  }

  return findings;
}

export function allAnalyzerFindings(
  discovery: WebsiteDiscovery
): AnalyzerFinding[] {
  return [...runSecurityAnalyzer(discovery), ...runWebsiteAnalyzer(discovery)];
}
