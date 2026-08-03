"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BellRing,
  Brain,
  Building2,
  FileText,
  FolderOpen,
  MessageCircle,
  NotebookPen,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useSimpleHomeData } from "@/hooks/useSimpleHomeData";
import {
  formatActivityWhen,
  greetingName,
  timeOfDayGreeting,
} from "@/lib/simple-home/helpers";
import { VAULTS_PATH } from "@/lib/simple-home/routing";
import { documentsHref, dailyLogHref, REQUESTS_PATH } from "@/lib/routes";
import { profileTypeLabel } from "@/lib/profiles/types";
import { clientBusinessLabel } from "@/lib/client-requests/helpers";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="simple-home-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function SimpleHomeScreen() {
  const router = useRouter();
  const { active, profiles, accountName, loading: profilesLoading, switchProfile } =
    useActiveProfile();
  const { data, loading } = useSimpleHomeData();
  const [question, setQuestion] = useState("");

  if (profilesLoading) {
    return (
      <p className="p-6 text-sm text-ink-muted">Loading your home…</p>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupHub returnTo="/home" />
      </div>
    );
  }

  const greeting = timeOfDayGreeting();
  const name = greetingName(accountName, active?.display_name);
  const category = data.category;
  const businessLabel = clientBusinessLabel(profiles, active);
  const showToday =
    data.pendingCount > 0 ||
    data.openRequestCount > 0 ||
    data.todayDocuments.length > 0 ||
    data.todayAlerts.length > 0;

  const categoryQuickLinks = (() => {
    switch (category) {
      case "business":
        return [
          {
            href: documentsHref(active?.id),
            label: "Important work",
            icon: Building2,
          },
          {
            href: VAULTS_PATH,
            label: "Clients",
            icon: Users,
          },
          {
            href: REQUESTS_PATH,
            label: "Client requests",
            icon: MessageCircle,
          },
          {
            href: "/work-memory",
            label: "Work Memory",
            icon: Brain,
          },
          {
            href: "/recruit",
            label: "Recruit",
            icon: UserPlus,
          },
        ];
      case "client":
        return [
          {
            href: documentsHref(active?.id),
            label: "My documents",
            icon: FileText,
          },
          {
            href: REQUESTS_PATH,
            label: "My requests",
            icon: MessageCircle,
          },
          {
            href: `${REQUESTS_PATH}?new=1`,
            label: `Contact ${businessLabel}`,
            icon: MessageCircle,
          },
        ];
      case "family":
        return [
          {
            href: documentsHref(active?.id),
            label: "Files",
            icon: FileText,
          },
          {
            href: dailyLogHref(active?.id),
            label: "Daily log",
            icon: NotebookPen,
          },
        ];
      default:
        return [
          {
            href: documentsHref(active?.id),
            label: "Files",
            icon: FileText,
          },
          {
            href: dailyLogHref(active?.id),
            label: "Daily log",
            icon: NotebookPen,
          },
        ];
    }
  })();

  const chipClass =
    category === "business"
      ? "simple-chip-business"
      : category === "family"
        ? "simple-chip-warm"
        : "bg-surface border-border-subtle";

  function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (trimmed) {
      router.push(`/ask?draft=${encodeURIComponent(trimmed)}`);
      return;
    }
    router.push("/ask");
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 pb-28 sm:gap-7 sm:py-8">
      <header className="welcome-strip">
        <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-tight">
          {greeting}, {name}.
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">
          {active ? `${profileTypeLabel(active.profile_type)} vault` : "Guardian"}
        </p>
      </header>

      <form
        onSubmit={handleAskSubmit}
        className="simple-gideon-hero welcome-strip p-5 sm:p-6"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Ask Gideon</p>
            <p className="text-xs text-ink-muted">
              Your guide to everything in your vault
            </p>
          </div>
        </div>
        <label htmlFor="home-ask-gideon" className="sr-only">
          Ask Gideon
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <input
            id="home-ask-gideon"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you need help with?"
            className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-white px-4 py-3.5 text-sm text-foreground shadow-sm placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
          >
            Ask Gideon
          </button>
        </div>
      </form>

      {categoryQuickLinks.length > 0 ? (
        <div
          className="flex flex-wrap gap-2 welcome-strip"
          style={{ animationDelay: "0.1s" }}
        >
          {categoryQuickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:shadow-card ${chipClass}`}
              >
                <Icon className="h-4 w-4 text-brand" aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      {showToday ? (
        <Section title="Today">
          {loading ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : (
            <ul className="space-y-1">
              {data.openRequestCount > 0 ? (
                <li>
                  <Link
                    href={REQUESTS_PATH}
                    className="flex items-start gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-brand-light/40"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-light">
                      <MessageCircle className="h-3.5 w-3.5 text-brand" />
                    </span>
                    <span>
                      <span className="font-medium text-foreground">
                        {data.openRequestCount === 1
                          ? category === "business"
                            ? "1 open client request"
                            : "1 open request"
                          : category === "business"
                            ? `${data.openRequestCount} open client requests`
                            : `${data.openRequestCount} open requests`}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {category === "business"
                          ? "Review and reply in Requests"
                          : "View your conversation"}
                      </span>
                    </span>
                  </Link>
                </li>
              ) : null}
              {data.todayAlerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={documentsHref(active?.id)}
                    className="flex items-start gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-brand-light/40"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                      <BellRing className="h-3.5 w-3.5 text-amber-700" />
                    </span>
                    <span>
                      <span className="font-medium text-foreground">
                        {alert.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        Due {alert.dueDate}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {data.todayDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`${documentsHref(active?.id)}&documentId=${doc.id}`}
                    className="flex items-start gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-brand-light/40"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-light">
                      <FileText className="h-3.5 w-3.5 text-brand" />
                    </span>
                    <span>
                      <span className="font-medium text-foreground">
                        Recent document
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {doc.fileName}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {data.recentVaults.length > 0 ? (
        <Section title="Recent vaults">
          <ul className="space-y-1">
            {data.recentVaults.map((vault) => (
              <li key={vault.id}>
                <button
                  type="button"
                  onClick={() => {
                    void switchProfile(vault.id);
                    router.push(documentsHref(vault.id));
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition hover:bg-brand-light/35"
                >
                  <ProfileAvatar profile={vault} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {vault.display_name}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {profileTypeLabel(vault.profile_type)}
                    </span>
                  </span>
                  <FolderOpen className="h-4 w-4 shrink-0 text-brand/70" />
                </button>
              </li>
            ))}
          </ul>
          <Link
            href={VAULTS_PATH}
            className="mt-3 inline-block text-sm font-semibold text-brand-dark hover:underline"
          >
            View all
          </Link>
        </Section>
      ) : null}

      {data.recentActivity.length > 0 ? (
        <Section title="Recent activity">
          <ul className="space-y-1">
            {data.recentActivity.map((item) => (
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
        </Section>
      ) : null}
    </div>
  );
}
