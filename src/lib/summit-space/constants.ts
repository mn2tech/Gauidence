export const SUMMIT_SLUG = "small-business-summit-2026" as const;

export const SUMMIT_NAME =
  "2026 Small Business Government Contracting Summit" as const;

export const SUMMIT_SUBTITLE =
  "Small Business Contracting Intelligence Hub" as const;

export const SUMMIT_DESCRIPTION =
  "A Guardian-powered knowledge hub containing contracting resources, prime contractor insights, subcontracting opportunities, session takeaways, and follow-up resources from the 2026 Small Business Government Contracting Summit." as const;

export const SUMMIT_OWNER = "NM2TECH LLC" as const;

export const SUMMIT_SUGGESTED_QUESTIONS = [
  "Which prime contractors should small businesses approach?",
  "What subcontracting opportunities were discussed?",
  "How do I connect with prime contractors?",
  "What should I do after the summit?",
  "Which companies are interested in IT, AI, data or cybersecurity?",
  "What resources are available for small businesses?",
] as const;

export const SUMMIT_CATEGORY_CARDS = [
  { id: "opportunities", label: "Opportunities", icon: "target" },
  { id: "prime-contractors", label: "Prime Contractors", icon: "building" },
  { id: "agencies", label: "Agencies", icon: "landmark" },
  { id: "sessions", label: "Sessions", icon: "presentation" },
  { id: "resources", label: "Resources", icon: "book" },
  { id: "takeaways", label: "Summit Takeaways", icon: "lightbulb" },
] as const;

export const SUMMIT_DISCLAIMER =
  "Information is compiled from summit materials, publicly available sources, and attendee notes. Verify procurement information with the appropriate agency or prime contractor before making business decisions.";

export function summitPublicPath(slug: string = SUMMIT_SLUG): string {
  return `/s/${slug}`;
}

export function summitOrganizationPath(
  slug: string,
  orgSlug: string
): string {
  return `/s/${slug}/organization/${orgSlug}`;
}
