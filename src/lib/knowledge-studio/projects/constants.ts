/** MCPS Parent Knowledge — first Knowledge Project implementation. */

export const MCPS_PROJECT_SLUG = "mcps-parent";

export const MCPS_PROJECT_NAME = "MCPS Parent Knowledge";

export const MCPS_AUTHORITY = "Montgomery County Public Schools";

export const MCPS_DISCLAIMER = `Guardian for MCPS Parents is an independent information assistant
and is not affiliated with or endorsed by Montgomery County Public Schools.

Information is derived from publicly available MCPS sources.
For official or time-sensitive decisions, verify information directly with MCPS.`;

/** Allowed public MCPS domains (host or subdomain). */
export const MCPS_ALLOWED_DOMAINS = [
  "montgomeryschoolsmd.org",
  "mcpsmd.org", // e.g. gis.mcpsmd.org School Assignment Tool
] as const;

export const MCPS_CATEGORY_DEFS = [
  {
    slug: "calendar",
    name: "Calendar",
    description:
      "School days, holidays, early release, professional days, breaks, closures",
  },
  {
    slug: "schools",
    name: "Schools",
    description:
      "School directory, contacts, addresses, principals, levels, websites",
  },
  {
    slug: "school-assignment",
    name: "School Assignment",
    description:
      "Boundaries, official assignment tool, assignment procedures",
  },
  {
    slug: "transportation",
    name: "Transportation",
    description:
      "Bus policies, eligibility, delays, parent procedures, contacts",
  },
  {
    slug: "parent-resources",
    name: "Parent Resources",
    description:
      "ParentVUE, registration, support, multilingual and district contacts",
  },
] as const;

export const MCPS_CATEGORY_SLUGS = MCPS_CATEGORY_DEFS.map((c) => c.slug);

export const NO_VERIFIED_MCPS_ANSWER =
  "I couldn't find a verified answer in the current MCPS knowledge base.\n\nYou may want to check the official MCPS website or contact MCPS directly.";

/** Covenant Life School — single-school Knowledge Project. */
export const CLS_PROJECT_SLUG = "covenant-life";

export const CLS_PROJECT_NAME = "Covenant Life School";

export const CLS_AUTHORITY = "Covenant Life School";

export const CLS_DISCLAIMER = `Guardian for Covenant Life School is an independent information assistant
and is not affiliated with or endorsed by Covenant Life School.

Information is derived from publicly available Covenant Life School sources.
For official or time-sensitive decisions, verify information directly with Covenant Life School.`;

/** Allowed public CLS domains (host or subdomain). */
export const CLS_ALLOWED_DOMAINS = ["covenantlifeschool.org"] as const;

export const CLS_CATEGORY_DEFS = [
  {
    slug: "about",
    name: "About",
    description: "Mission, faith and values, guidance, employment",
  },
  {
    slug: "admissions",
    name: "Admissions",
    description: "Process, standards, tuition, tours, open house, international",
  },
  {
    slug: "academics",
    name: "Academics",
    description: "Preschool, elementary, middle school, high school programs",
  },
  {
    slug: "calendar",
    name: "Calendar",
    description: "School calendar, events, athletics calendar",
  },
  {
    slug: "athletics",
    name: "Athletics",
    description: "Sports programs, schedules, athletic information",
  },
  {
    slug: "parent-resources",
    name: "Parent Resources",
    description: "FACTS portal, communications, lunch, supplies, weather",
  },
  {
    slug: "community",
    name: "Community",
    description: "Uniforms, after care, summer camps, parent involvement",
  },
  {
    slug: "health-safety",
    name: "Health & Safety",
    description: "Student health, safety standards, emergency communications",
  },
  {
    slug: "contact",
    name: "Contact",
    description: "Address, phone, email, faculty directory",
  },
] as const;

export const CLS_CATEGORY_SLUGS = CLS_CATEGORY_DEFS.map((c) => c.slug);

export const NO_VERIFIED_CLS_ANSWER =
  "I couldn't find a verified answer in the current Covenant Life School knowledge base.\n\nYou may want to check the official Covenant Life School website (https://www.covenantlifeschool.org/) or contact the school directly.";

/**
 * High-value public pages to seed manually via Add Source
 * (Knowledge Studio does not auto-crawl).
 */
export const CLS_STARTER_SOURCES = [
  {
    source_name: "CLS Homepage",
    source_url: "https://www.covenantlifeschool.org/",
    category: "about",
  },
  {
    source_name: "About Us",
    source_url: "https://www.covenantlifeschool.org/about-us/",
    category: "about",
  },
  {
    source_name: "Faith, Philosophy and Values",
    source_url:
      "https://www.covenantlifeschool.org/about-us/faith-philosophy-and-values/",
    category: "about",
  },
  {
    source_name: "Admissions",
    source_url: "https://www.covenantlifeschool.org/admissions/",
    category: "admissions",
  },
  {
    source_name: "Admissions Process",
    source_url: "https://www.covenantlifeschool.org/admissions/admissions-process/",
    category: "admissions",
  },
  {
    source_name: "Variable Tuition",
    source_url: "https://www.covenantlifeschool.org/admissions/variable-tuition/",
    category: "admissions",
  },
  {
    source_name: "Open House",
    source_url: "https://www.covenantlifeschool.org/admissions/open-house/",
    category: "admissions",
  },
  {
    source_name: "International Students",
    source_url:
      "https://www.covenantlifeschool.org/admissions/international-students/",
    category: "admissions",
  },
  {
    source_name: "Preschool",
    source_url: "https://www.covenantlifeschool.org/preschool/",
    category: "academics",
  },
  {
    source_name: "Elementary School",
    source_url: "https://www.covenantlifeschool.org/elementary-school/",
    category: "academics",
  },
  {
    source_name: "Middle School",
    source_url: "https://www.covenantlifeschool.org/middle-school/",
    category: "academics",
  },
  {
    source_name: "High School",
    source_url: "https://www.covenantlifeschool.org/high-school/",
    category: "academics",
  },
  {
    source_name: "School Calendar",
    source_url: "https://www.covenantlifeschool.org/calendar/",
    category: "calendar",
  },
  {
    source_name: "Athletics",
    source_url: "https://www.covenantlifeschool.org/athletics/",
    category: "athletics",
  },
  {
    source_name: "Parent Resources",
    source_url: "https://www.covenantlifeschool.org/parent-resources/",
    category: "parent-resources",
  },
  {
    source_name: "Uniforms",
    source_url: "https://www.covenantlifeschool.org/community/uniforms/",
    category: "community",
  },
  {
    source_name: "After Care",
    source_url: "https://www.covenantlifeschool.org/after-care/",
    category: "community",
  },
  {
    source_name: "Summer Camps",
    source_url: "https://www.covenantlifeschool.org/community/summer-camps/",
    category: "community",
  },
  {
    source_name: "Student Health and Safety",
    source_url:
      "https://www.covenantlifeschool.org/about-us/student-health-and-safety/",
    category: "health-safety",
  },
  {
    source_name: "Faculty Directory",
    source_url: "https://www.covenantlifeschool.org/faculty-directory/",
    category: "contact",
  },
] as const;

export const PROJECT_FETCH_TIMEOUT_MS = 15_000;
export const PROJECT_MAX_RESPONSE_BYTES = 2_000_000;
export const PROJECT_MAX_TEXT_CHARS = 40_000;

/** Domain allowlist lookup for Knowledge Studio project slugs. */
export function allowedDomainsForProject(
  slug: string
): readonly string[] | null {
  if (slug === MCPS_PROJECT_SLUG) return MCPS_ALLOWED_DOMAINS;
  if (slug === CLS_PROJECT_SLUG) return CLS_ALLOWED_DOMAINS;
  return null;
}
