"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderPlus, MessageCircle } from "lucide-react";
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
import {
  WORLD_PATH,
  HISTORY_PATH,
  ASK_GIDEON_PATH,
  WORLD_INBOX_PATH,
} from "@/lib/simple-home/routing";
import { documentsHref, worldEntityHref } from "@/lib/routes";
import type { GuardianIntelligenceItem } from "@/lib/guardian-today/types";
import { getContainerLabel, topLevelProfiles } from "@/lib/profiles/types";
import { todaySpaceFilterOptions } from "@/lib/guardian-today/spaceScope";
import { PERSONAL_SPACE_DISPLAY_NAME } from "@/lib/personal-space/types";
import { isPersonalSpaceProfile } from "@/lib/personal-space/welcome";
import type { WorldOverview } from "@/lib/world/apiTypes";

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
  const [world, setWorld] = useState<WorldOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/world/overview");
        if (!res.ok) return;
        const body = (await res.json()) as WorldOverview;
        if (!cancelled) setWorld(body);
      } catch {
        /* overview optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const topLevelSpaces = [...topLevelProfiles(profiles)].sort((a, b) => {
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
  const filterSpaces = todaySpaceFilterOptions(
    profiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      profile_type: p.profile_type,
      parent_profile_id: p.parent_profile_id,
    }))
  );
  const spaceIdsKey = filterSpaces.map((s) => s.id).join(",");

  useEffect(() => {
    if (profilesLoading || !spaceIdsKey) return;
    if (!today.scopeSpaceId) return;
    if (!filterSpaces.some((s) => s.id === today.scopeSpaceId)) {
      today.setScope(null);
    }
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
    today.data.needsAttention.length === 0 &&
    today.data.upcoming.length === 0 &&
    today.data.recent.length === 0 &&
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
      if (
        (body.plan === "free" || !body.plan) &&
        topLevelSpaces.length >= limit
      ) {
        openUpgrade({
          reason:
            "You've used your Free Space. Upgrade to Guardian Pro to create more Spaces — your existing knowledge stays available.",
        });
        return;
      }
    } catch {
      /* fall through */
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
      spaces={filterSpaces}
      value={today.scopeSpaceId}
      onChange={today.setScope}
    />
  );
  const hasAttention = today.data.needsAttention.length > 0;
  const hasUpcoming = today.data.upcoming.length > 0;
  const hasRecent = today.data.recent.length > 0;
  const hasAnySections = hasAttention || hasUpcoming || hasRecent;
  const attentionItems = hasAttention
    ? today.data.needsAttention
    : !hasUpcoming && today.data.priorities.length > 0
      ? today.data.priorities
      : [];

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-7 sm:py-8">
      {/* 1. Greeting */}
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

      {/* 2. What matters — full priority cards only (no duplicate teaser list) */}
      {today.loading ? (
        <Section title="Here's what matters today" action={spaceFilter}>
          <p className="text-sm text-ink-muted">Loading…</p>
        </Section>
      ) : hasAnySections || attentionItems.length > 0 ? (
        <Section title="Here's what matters today" action={spaceFilter}>
          <GuardianPartialBanner
            coverage={today.data.coverage ?? emptyCoverage()}
          />
          {attentionItems.length > 0 ? (
            <PriorityList items={attentionItems} today={today} />
          ) : (
            <p className="text-sm text-ink-muted">
              Nothing needs you right now.
            </p>
          )}
          {today.data.coverageSummary ? (
            <div className="mt-4 border-t border-border-subtle pt-3">
              <GuardianCoverageFooter summary={today.data.coverageSummary} />
            </div>
          ) : null}
        </Section>
      ) : (
        <Section title="Here's what matters today" action={spaceFilter}>
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

      {/* 3. Coming up */}
      {hasUpcoming ? (
        <Section title="Coming up">
          <PriorityList items={today.data.upcoming} today={today} />
        </Section>
      ) : null}
      {today.data.whatChanged.length > 0 && !hasRecent ? (
        <GuardianWhatChanged entries={today.data.whatChanged} />
      ) : null}

      {/* 5. My World */}
      <Section
        title="My World"
        action={
          <Link
            href={WORLD_PATH}
            className="text-xs font-semibold text-brand hover:text-brand-dark"
          >
            Open
          </Link>
        }
      >
        {world ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {world.counts.people}
                </div>
                <div className="text-xs text-ink-muted">People</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {world.counts.organizations}
                </div>
                <div className="text-xs text-ink-muted">Orgs</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {world.counts.events}
                </div>
                <div className="text-xs text-ink-muted">Events</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {world.counts.things}
                </div>
                <div className="text-xs text-ink-muted">Things</div>
              </div>
            </div>
            {world.important.length > 0 ? (
              <ul className="divide-y divide-stone-100">
                {world.important.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={worldEntityHref(e.id)}
                      className="flex items-center justify-between py-2 text-sm hover:text-brand"
                    >
                      <span className="font-medium">{e.name}</span>
                      <span className="text-xs text-ink-muted">{e.typeLabel}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">
                Guardian builds your world as you add documents and notes —
                without you organizing first.
              </p>
            )}
            {world.inboxPendingCount > 0 ? (
              <Link
                href={WORLD_INBOX_PATH}
                className="inline-block text-xs font-semibold text-brand hover:underline"
              >
                {world.inboxPendingCount} confirmation
                {world.inboxPendingCount === 1 ? "" : "s"} waiting
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            <Link href={WORLD_PATH} className="font-semibold text-brand">
              Open My World
            </Link>{" "}
            to see people, organizations, and what Guardian knows.
          </p>
        )}
      </Section>

      {/* 6. Recently Changed */}
      {hasRecent ? (
        <Section
          title="Recently changed"
          action={
            <Link
              href={HISTORY_PATH}
              className="text-xs font-semibold text-brand hover:text-brand-dark"
            >
              Full History
            </Link>
          }
        >
          <ul className="space-y-1">
            {today.data.recent.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`${HISTORY_PATH}?eventId=${encodeURIComponent(entry.id)}`}
                  className="flex items-start justify-between gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-brand-light/35"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {entry.typeLabel}
                      {entry.spaceName ? ` · ${entry.spaceName}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {formatActivityWhen(entry.occurredAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : world && world.recentChanges.length > 0 ? (
        <Section
          title="Recently changed"
          action={
            <Link
              href={WORLD_PATH}
              className="text-xs font-semibold text-brand hover:text-brand-dark"
            >
              My World
            </Link>
          }
        >
          <ul className="space-y-1">
            {world.recentChanges.map((c) => (
              <li key={c.id}>
                {c.entityId ? (
                  <Link
                    href={worldEntityHref(c.entityId)}
                    className="flex items-start justify-between gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-brand-light/35"
                  >
                    <span className="min-w-0 font-medium text-foreground">
                      {c.title}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {formatActivityWhen(c.occurredAt)}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3 px-2 py-2.5 text-sm">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-xs text-ink-muted">
                      {formatActivityWhen(c.occurredAt)}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 7. Ask Gideon */}
      <Section title="Ask Gideon">
        <Link
          href={ASK_GIDEON_PATH}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <MessageCircle className="h-4 w-4" />
          Ask Gideon anything
        </Link>
      </Section>

      {/* Spaces — secondary */}
      <Section
        title="Spaces"
        action={
          <button
            type="button"
            onClick={() => void handleNewSpace()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-foreground"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New
          </button>
        }
      >
        <ul className="space-y-1">
          {topLevelSpaces.slice(0, 5).map((space) => (
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
