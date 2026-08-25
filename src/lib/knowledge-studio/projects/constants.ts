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

export const PROJECT_FETCH_TIMEOUT_MS = 15_000;
export const PROJECT_MAX_RESPONSE_BYTES = 2_000_000;
export const PROJECT_MAX_TEXT_CHARS = 40_000;
