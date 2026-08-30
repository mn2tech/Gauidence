"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users, Briefcase, UserPlus } from "lucide-react";
import { useUpgradeModal } from "@/components/UpgradeProvider";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  canManageProfileAccess,
  isOrgStyleProfile,
  topLevelProfiles,
  type GuardianProfile,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import { planRank, type PlanId } from "@/lib/billing/plans";

type BillingStatus = { plan?: string };

function isFamilyType(type: GuardianProfileType | undefined): boolean {
  return (
    type === "family" ||
    type === "child" ||
    type === "student" ||
    type === "spouse_partner" ||
    type === "parent" ||
    type === "family_member" ||
    type === "home" ||
    type === "pet"
  );
}

function ownedFamilySpace(
  profiles: GuardianProfile[],
  active: GuardianProfile | null
): GuardianProfile | null {
  if (
    active?.profile_type === "family" &&
    canManageProfileAccess(active)
  ) {
    return active;
  }
  return (
    topLevelProfiles(profiles).find(
      (p) => p.profile_type === "family" && canManageProfileAccess(p)
    ) ?? null
  );
}

/**
 * Soft upgrade / invite wedge on Home when Spaces scream Family or Business.
 * Paid Family (or higher) with an owned Family Space → Invite partner CTA.
 */
export default function PlanWedgeBanner() {
  const { openUpgrade } = useUpgradeModal();
  const { active, profiles } = useActiveProfile();
  const [plan, setPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/billing/status");
        const body = (await res.json().catch(() => ({}))) as BillingStatus;
        if (!cancelled) {
          setPlan((body.plan as PlanId) || "free");
        }
      } catch {
        if (!cancelled) setPlan("free");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const familySpace = useMemo(
    () => ownedFamilySpace(profiles, active),
    [profiles, active]
  );

  if (plan == null) return null;

  const hasFamilySpace = profiles.some((p) => isFamilyType(p.profile_type));
  const hasBusinessSpace = profiles.some((p) =>
    isOrgStyleProfile(p.profile_type)
  );
  const activeIsFamily = isFamilyType(active?.profile_type);
  const activeIsBusiness =
    active != null && isOrgStyleProfile(active.profile_type);

  const showFamilyUpgrade =
    (hasFamilySpace || activeIsFamily) && planRank(plan) < planRank("family");
  const showBusiness =
    (hasBusinessSpace || activeIsBusiness) &&
    planRank(plan) < planRank("business");
  const showInvitePartner =
    familySpace != null && planRank(plan) >= planRank("family");

  // Prefer context of active Space; otherwise first matching wedge.
  if (activeIsBusiness && showBusiness) {
    return (
      <WedgeCard
        icon={<Briefcase className="h-4 w-4" aria-hidden />}
        title="Run clients and team on Guardian Business"
        body="Leads, Employee Hub, client Spaces, and higher volume — built for your firm."
        cta="Upgrade to Business"
        onClick={() =>
          openUpgrade({
            plan: "business",
            reason:
              "You're using a business Space. Guardian Business unlocks team tools, clients, and Leads with higher limits.",
          })
        }
      />
    );
  }

  if ((activeIsFamily || showFamilyUpgrade) && showFamilyUpgrade) {
    return (
      <WedgeCard
        icon={<Users className="h-4 w-4" aria-hidden />}
        title="Share your household with Guardian Family"
        body="Invite a spouse or partner to one Family Space — kids, school, pets, and home together."
        cta="Upgrade to Family"
        onClick={() =>
          openUpgrade({
            plan: "family",
            reason:
              "You're building a household in Guardian. Family lets you share one Space and keep school + home in one place.",
          })
        }
      />
    );
  }

  if (showInvitePartner && familySpace) {
    const name = familySpace.display_name?.trim() || "your Family Space";
    return (
      <WedgeCard
        icon={<UserPlus className="h-4 w-4" aria-hidden />}
        title="Invite a partner"
        body={`Add a spouse or partner to ${name} so you both see the same Today — school, kids, and home.`}
        cta="Invite partner"
        href={`/settings/profiles/${familySpace.id}/collaborators`}
      />
    );
  }

  if (showBusiness) {
    return (
      <WedgeCard
        icon={<Briefcase className="h-4 w-4" aria-hidden />}
        title="Run clients and team on Guardian Business"
        body="Leads, Employee Hub, client Spaces, and higher volume — built for your firm."
        cta="Upgrade to Business"
        onClick={() =>
          openUpgrade({
            plan: "business",
            reason:
              "You're using a business Space. Guardian Business unlocks team tools, clients, and Leads with higher limits.",
          })
        }
      />
    );
  }

  return null;
}

function WedgeCard({
  icon,
  title,
  body,
  cta,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  onClick?: () => void;
  href?: string;
}) {
  const ctaClass =
    "shrink-0 rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-dark";

  return (
    <aside className="simple-home-card flex flex-col gap-3 border-brand/25 bg-gradient-to-br from-brand-light/70 via-white to-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">
            {icon}
          </span>
          {title}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-700">{body}</p>
      </div>
      {href ? (
        <Link href={href} className={ctaClass}>
          {cta}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={ctaClass}>
          {cta}
        </button>
      )}
    </aside>
  );
}
