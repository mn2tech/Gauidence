"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useEmployeeHubEntitlements } from "@/hooks/useEmployeeHubEntitlements";
import { employeeShowsPowerNav } from "@/lib/employee-hub/entitlements";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import {
  COMMAND_CENTER_PATH,
  SIMPLE_HOME_PATH,
} from "@/lib/simple-home/routing";
import { LEADS_PATH, PROPOSALS_PATH } from "@/lib/routes";

type SimpleSecondaryNavLinksProps = {
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
  showDivider?: boolean;
};

type NavLink = { href: string; label: string };

const DEFAULT_LINK_CLASS =
  "block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-stone-100";

const BUSINESS_TOOL_LINKS: NavLink[] = [
  { href: "/work-memory", label: "Work Memory" },
  { href: LEADS_PATH, label: "Leads" },
  { href: "/recruit", label: "Recruit" },
  { href: "/business-advisor", label: "Business Advisor" },
  { href: "/proposals", label: "Proposals" },
];

function ToolsDropdown({
  links,
  onNavigate,
  linkClassName,
}: {
  links: NavLink[];
  onNavigate?: () => void;
  linkClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (links.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 ${linkClassName}`}
      >
        Tools
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-2 min-w-[12rem] rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="block px-3 py-2 text-sm font-medium text-foreground hover:bg-stone-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Secondary tools for the simple home experience (profile menu / desktop header).
 * Desktop: Guardian Today stays primary; Command Center + vault tools collapse under Tools.
 * Mobile drawer: same split under a Tools heading.
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

  const primaryLinks: NavLink[] = [
    { href: SIMPLE_HOME_PATH, label: "Guardian Today" },
  ];

  const isFamilyContext =
    active?.profile_type === "family" ||
    active?.profile_type === "child" ||
    active?.profile_type === "student" ||
    active?.profile_type === "spouse_partner" ||
    active?.profile_type === "parent" ||
    active?.profile_type === "family_member";

  const familyLinks = isFamilyContext
    ? [{ href: "/parent", label: "My School" }]
    : [];

  const ent = employeeEntitlements;
  const vaultToolLinks: NavLink[] = isBusinessVault
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
        : [...familyLinks];

  const toolLinks: NavLink[] = [
    { href: COMMAND_CENTER_PATH, label: "Command Center" },
    ...vaultToolLinks,
  ];

  if (isEmployeeVault && !showEmployeeTools) {
    // Hub-locked employees: Today + Command Center only (no vault tool suite).
    if (vaultToolLinks.length > 0) return null;
  }

  if (primaryLinks.length === 0 && toolLinks.length === 0) return null;

  const panelClass = showDivider ? "simple-tools-panel mb-2 p-2" : "";
  const desktop = !showDivider;

  return (
    <div className={`${panelClass} ${className ?? ""}`.trim()}>
      {primaryLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className={linkClassName}
        >
          {link.label}
        </Link>
      ))}

      {desktop ? (
        <ToolsDropdown
          links={toolLinks}
          onNavigate={onNavigate}
          linkClassName={linkClassName}
        />
      ) : toolLinks.length > 0 ? (
        <>
          <p className="px-2 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
            Tools
          </p>
          {toolLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={linkClassName}
            >
              {link.label}
            </Link>
          ))}
        </>
      ) : null}
    </div>
  );
}
