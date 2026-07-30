"use client";

import Link from "next/link";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useEmployeeHubEntitlements } from "@/hooks/useEmployeeHubEntitlements";
import { employeeShowsPowerNav } from "@/lib/employee-hub/entitlements";
import { isOrgStyleProfile } from "@/lib/profiles/types";

type SimpleSecondaryNavLinksProps = {
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
  showDivider?: boolean;
};

const DEFAULT_LINK_CLASS =
  "block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-stone-100";

const BUSINESS_TOOL_LINKS = [
  { href: "/work-memory", label: "Work Memory" },
  { href: "/recruit", label: "Recruit" },
] as const;

/**
 * Secondary tools for the simple home experience (profile menu / desktop header).
 * Business vaults always see Work Memory and Recruit once a vault exists.
 */
export default function SimpleSecondaryNavLinks({
  onNavigate,
  className,
  linkClassName = DEFAULT_LINK_CLASS,
  showDivider = true,
}: SimpleSecondaryNavLinksProps) {
  const { active, profiles, loading: profilesLoading } = useActiveProfile();

  const needsSetup = !profilesLoading && profiles.length === 0;
  const isEmployeeVault = active?.profile_type === "employee";
  const isBusinessVault =
    active != null && isOrgStyleProfile(active.profile_type);
  const { entitlements: employeeEntitlements } = useEmployeeHubEntitlements(
    isEmployeeVault ? active?.id : undefined,
    isEmployeeVault ? active?.parent_profile_id ?? undefined : undefined
  );

  const showEmployeeTools =
    isEmployeeVault &&
    employeeEntitlements &&
    employeeShowsPowerNav(employeeEntitlements);

  if (needsSetup) return null;

  const ent = employeeEntitlements;
  const links = isBusinessVault
    ? [
        ...BUSINESS_TOOL_LINKS,
        { href: "/research", label: "Research" },
        { href: "/payroll", label: "Payroll" },
      ]
    : isEmployeeVault
      ? [
          ...(ent?.research ? [{ href: "/research", label: "Research" }] : []),
          ...(ent?.work_memory
            ? [{ href: "/work-memory", label: "Work Memory" }]
            : []),
          ...(ent?.experts ? [{ href: "/experts", label: "Experts" }] : []),
          ...(ent?.recruit ? [{ href: "/recruit", label: "Recruit" }] : []),
          ...(ent?.payroll_admin
            ? [{ href: "/payroll", label: "Payroll" }]
            : []),
        ]
      : [
          { href: "/research", label: "Research" },
          { href: "/work-memory", label: "Work Memory" },
          { href: "/experts", label: "Experts" },
          { href: "/recruit", label: "Recruit" },
          { href: "/payroll", label: "Payroll" },
        ];

  if (isEmployeeVault && !showEmployeeTools) return null;
  if (links.length === 0) return null;

  return (
    <div className={className}>
      {showDivider ? (
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Tools
        </p>
      ) : null}
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className={linkClassName}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
