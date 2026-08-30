"use client";

import { useEffect, useState } from "react";
import { Users, Briefcase } from "lucide-react";
import { useUpgradeModal } from "@/components/UpgradeProvider";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  isOrgStyleProfile,
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

/**
 * Soft upgrade wedge on Home when the user's Spaces scream Family or Business
 * but their plan is below that tier.
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

  if (plan == null) return null;

  const hasFamilySpace = profiles.some((p) => isFamilyType(p.profile_type));
  const hasBusinessSpace = profiles.some((p) =>
    isOrgStyleProfile(p.profile_type)
  );
  const activeIsFamily = isFamilyType(active?.profile_type);
  const activeIsBusiness =
    active != null && isOrgStyleProfile(active.profile_type);

  const showFamily =
    (hasFamilySpace || activeIsFamily) && planRank(plan) < planRank("family");
  const showBusiness =
    (hasBusinessSpace || activeIsBusiness) &&
    planRank(plan) < planRank("business");

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

  if ((activeIsFamily || showFamily) && showFamily) {
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
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
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
      <button
        type="button"
        onClick={onClick}
        className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        {cta}
      </button>
    </aside>
  );
}
