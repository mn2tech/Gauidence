"use client";

import Link from "next/link";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useEmployeeHubEntitlements } from "@/hooks/useEmployeeHubEntitlements";
import { employeeShowsPowerNav } from "@/lib/employee-hub/entitlements";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import { COMMAND_CENTER_PATH } from "@/lib/simple-home/routing";
import { PROPOSALS_PATH } from "@/lib/routes";

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
  { href: "/business-advisor", label: "Business Advisor" },
  { href: "/proposals", label: "Proposals" },
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
  const isClientVault = active?.profile_type === "client";
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

  const universalLinks = [{ href: COMMAND_CENTER_PATH, label: "Command Center" }];

  const ent = employeeEntitlements;
  const links = isBusinessVault
    ? [
        ...BUSINESS_TOOL_LINKS,
        { href: "/research", label: "Research" },
        { href: "/payroll", label: "Payroll" },
      ]
    : isClientVault
      ? [{ href: PROPOSALS_PATH, label: "Proposals" }]
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
      : [];

  if (isEmployeeVault && !showEmployeeTools && links.length === 0) {
    return (
      <div className={`${showDivider ? "simple-tools-panel mb-2 p-2" : ""} ${className ?? ""}`.trim()}>
        {universalLinks.map((link) => (
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
  if (isEmployeeVault && !showEmployeeTools) return null;
  if (links.length === 0 && universalLinks.length === 0) return null;

  const panelClass = showDivider ? "simple-tools-panel mb-2 p-2" : "";

  return (
    <div className={`${panelClass} ${className ?? ""}`.trim()}>
      {showDivider ? (
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
          Tools
        </p>
      ) : null}
      {universalLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className={linkClassName}
        >
          {link.label}
        </Link>
      ))}
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
