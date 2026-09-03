"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderPlus } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useUpgradeModal } from "@/components/UpgradeProvider";
import { useSimpleHomeData } from "@/hooks/useSimpleHomeData";
import { useGuardianToday } from "@/hooks/useGuardianToday";
import PersonalSpaceWelcome from "@/components/personal-space/PersonalSpaceWelcome";
import GideonWelcome from "@/components/gideon-welcome/GideonWelcome";
import PlanWedgeBanner from "@/components/simple-home/PlanWedgeBanner";
import { GuardianPriorityCard } from "@/components/guardian-today/GuardianPriorityCard";
import {
  GuardianCoverageFooter,
  GuardianIntelligenceEmptyState,
  GuardianPartialBanner,
  GuardianProvenancePanel,
  GuardianTodaySpaceFilter,
  GuardianWhatChanged,
} from "@/components/guardian-today/GuardianTodaySections";
import { GuardianSourcePanel } from "@/hooks/useGuardianWatchHome";
import { formatActivityWhen } from "@/lib/simple-home/helpers";
import { VAULTS_PATH } from "@/lib/simple-home/routing";
import { documentsHref } from "@/lib/routes";
import type { GuardianIntelligenceItem } from "@/lib/guardian-today/types";
import { getContainerLabel, topLevelProfiles } from "@/lib/profiles/types";
import { PERSONAL_SPACE_DISPLAY_NAME } from "@/lib/personal-space/types";
import { isPersonalSpaceProfile } from "@/lib/personal-space/welcome";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="simple-home-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function PriorityList({
  items,
  groupName,
  today,
}: {
  items: GuardianIntelligenceItem[];
  groupName?: string | null;
  today: ReturnType<typeof useGuardianToday>;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <GuardianPriorityCard
          key={item.id}
          item={item}
          showSpaceName={Boolean(
            item.spaceName && item.spaceName !== groupName
          )}
          onComplete={(id) => void today.complete(id)}
          onDismiss={(id) => void today.dismiss(id)}
          onSnooze={(id) => void today.snooze(id)}
          onViewSource={(i) => void today.viewSource(i)}
          onAskGideon={(i) => today.askGideon(i)}
          onReview={(i) => today.review(i)}
          onWhy={(i) => today.setProvenanceOpen(i)}
        />
      ))}
    </ul>
  );
}

function emptyCoverage() {
  return {
    spaceCount: 0,
    sourceCount: 0,
    processedSourceCount: 0,
    pendingSourceCount: 0,
    processingSourceCount: 0,
    failedSourceCount: 0,
    activeItemCount: 0,
    lastExtractionAt: null,
    lastWatchEvaluationAt: null,
    status: "never_scanned" as const,
  };
}

export default function SimpleHomeScreen() {
  const router = useRouter();
  const { active, profiles, loading: profilesLoading, switchProfile } =
    useActiveProfile();
  const { data: homeData, loading: homeLoading } = useSimpleHomeData();
  const today = useGuardianToday();
  const { openUpgrade } = useUpgradeModal();

  const spaces = [...topLevelProfiles(profiles)].sort((a, b) => {
    const order: Record<string, number> = {
      personal: 0,
      family: 1,
      business: 2,
      non_profit: 3,
    };
    const oa = order[a.profile_type] ?? 8;
    const ob = order[b.profile_type] ?? 8;
    if (oa !== ob) return oa - ob;
    return a.display_name.localeCompare(b.display_name);
  });
  const spaceIdsKey = spaces.map((s) => s.id).join(",");

  useEffect(() => {
    if (profilesLoading || !spaceIdsKey) return;
    if (!today.scopeSpaceId) return;
    if (!spaces.some((s) => s.id === today.scopeSpaceId)) {
      today.setScope(null);
    }
    // spaces identity is represented by spaceIdsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading, spaceIdsKey, today.scopeSpaceId, today.setScope]);
  const personal =
    profiles.find((p) => isPersonalSpaceProfile(p) && p.is_default) ??
    profiles.find((p) => isPersonalSpaceProfile(p)) ??
    null;
  const isPersonalActive = active
    ? isPersonalSpaceProfile(active)
    : Boolean(personal);
  const knowledgeEmpty =
    !homeLoading &&
    !today.loading &&
    homeData.recentActivity.length === 0 &&
    today.data.priorities.length === 0 &&
    today.data.whatChanged.length === 0 &&
    (today.data.coverage?.status === "no_sources" ||
      (today.data.coverage?.sourceCount ?? 0) === 0);

  async function handleNewSpace() {
    try {
      const res = await fetch("/api/billing/status");
      const body = (await res.json().catch(() => ({}))) as {
        plan?: string;
        limits?: { spacesPerAccount?: number };
      };
      const limit = body.limits?.spacesPerAccount ?? 1;
      if ((body.plan === "free" || !body.plan) && spaces.length >= limit) {
        openUpgrade({
          reason:
            "You've used your Free Space. Upgrade to Guardian Pro to create more Spaces — your existing knowledge stays available.",
        });
        return;
      }
    } catch {
      /* fall through to create UI */
    }
    router.push("/settings/profiles?add=1&return=%2Fhome");
  }

  if (profilesLoading) {
    return <p className="p-6 text-sm text-ink-muted">Loading your home…</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PersonalSpaceWelcome spaceName={PERSONAL_SPACE_DISPLAY_NAME} />
        <p className="mt-6 text-center text-sm text-ink-muted">
          Setting up your Personal Space…
        </p>
        <div className="mt-4">
          <ProfileSetupHub returnTo="/home" />
        </div>
      </div>
    );
  }

  const showPersonalWelcome = isPersonalActive && knowledgeEmpty;
  const spaceFilter = (
    <GuardianTodaySpaceFilter
      spaces={spaces}
      value={today.scopeSpaceId}
      onChange={today.setScope}
    />
  );
  const groups =
    today.data.groups.length > 0
      ? today.data.groups
      : today.data.priorities.length > 0
        ? [
            {
              spaceId: "all",
              spaceName: today.data.scopeSpaceName ?? "All spaces",
              profileType: null,
              priorities: today.data.priorities,
            },
          ]
        : [];
  const showGroupHeadings = !today.scopeSpaceId && groups.length > 1;

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-7 sm:py-8">
      {showPersonalWelcome ? (
        <PersonalSpaceWelcome
          spaceName={
            personal?.display_name ||
            active?.display_name ||
            PERSONAL_SPACE_DISPLAY_NAME
          }
        />
      ) : (
        <GideonWelcome mode="today" />
      )}

      <PlanWedgeBanner />

      {today.actionNote ? (
        <p className="-mb-2 text-sm font-medium text-brand" role="status">
          {today.actionNote}
        </p>
      ) : null}
      {today.actionError ? (
        <p className="-mb-2 text-sm font-medium text-rose-700" role="alert">
          {today.actionError}{" "}
          <button
            type="button"
            onClick={() => today.clearActionError()}
            className="underline"
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {today.loading ? (
        <Section title="Today's priorities" action={spaceFilter}>
          <p className="text-sm text-ink-muted">Loading…</p>
        </Section>
      ) : today.data.priorities.length > 0 ? (
        <Section title="Today's priorities" action={spaceFilter}>
          <GuardianPartialBanner
            coverage={today.data.coverage ?? emptyCoverage()}
          />
          {showGroupHeadings ? (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.spaceId}>
                  <h3 className="mb-2.5 text-sm font-semibold tracking-tight text-foreground">
                    {group.spaceName}
                  </h3>
                  <PriorityList
                    items={group.priorities}
                    groupName={group.spaceName}
                    today={today}
                  />
                </div>
              ))}
            </div>
          ) : (
            <PriorityList
              items={groups[0]?.priorities ?? today.data.priorities}
              groupName={
                today.scopeSpaceId
                  ? today.data.scopeSpaceName ?? groups[0]?.spaceName
                  : null
              }
              today={today}
            />
          )}
          {today.data.coverageSummary ? (
            <div className="mt-4 border-t border-border-subtle pt-3">
              <GuardianCoverageFooter summary={today.data.coverageSummary} />
            </div>
          ) : null}
        </Section>
      ) : (
        <Section title="Today's priorities" action={spaceFilter}>
          <GuardianIntelligenceEmptyState
            coverage={today.data.coverage ?? emptyCoverage()}
            coverageSummary={today.data.coverageSummary}
            scopeName={today.data.scopeSpaceName}
            framed={false}
            onRetry={() => void today.runBackfill()}
            retrying={today.retrying}
            showRecentActivity={
              today.data.caughtUp && homeData.recentActivity.length > 0
            }
          >
            <ul className="space-y-1">
              {homeData.recentActivity.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start justify-between gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-brand-light/35"
                  >
                    <span className="min-w-0 font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {formatActivityWhen(item.occurredAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </GuardianIntelligenceEmptyState>
        </Section>
      )}

      <GuardianWhatChanged entries={today.data.whatChanged} />

      <Section title="Your Spaces">
        <ul className="space-y-1">
          {spaces.slice(0, 5).map((space) => (
            <li key={space.id}>
              <button
                type="button"
                onClick={() => {
                  void switchProfile(space.id);
                  router.push(documentsHref(space.id));
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-brand-light/35"
              >
                <ProfileAvatar profile={space} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {space.display_name}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {getContainerLabel(space.profile_type)}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={VAULTS_PATH}
            className="text-xs font-semibold text-brand hover:text-brand-dark"
          >
            View all Spaces
          </Link>
          <button
            type="button"
            onClick={() => void handleNewSpace()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-foreground"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Space
          </button>
        </div>
      </Section>

      <GuardianProvenancePanel
        item={today.provenanceOpen}
        onClose={() => today.setProvenanceOpen(null)}
      />
      <GuardianSourcePanel
        open={today.sourceOpen}
        onClose={today.closeSource}
      />
    </div>
  );
}
