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
import { documentsHref, dailyLogHref } from "@/lib/routes";
import { profileTypeLabel } from "@/lib/profiles/types";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
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
  const showToday =
    data.pendingCount > 0 ||
    data.todayDocuments.length > 0 ||
    data.todayAlerts.length > 0;

  const categoryQuickLinks = (() => {
    switch (data.category) {
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
            href: `/ask?draft=${encodeURIComponent("I need to request something from the company.")}`,
            label: "My requests",
            icon: MessageCircle,
          },
          {
            href: "/ask",
            label: "Contact company",
            icon: MessageCircle,
          },
        ];
      case "family":
        return [
          {
            href: documentsHref(active?.id),
            label: "Documents",
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
            label: "Documents",
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-28 sm:py-8">
      <header>
        <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {greeting}, {name}.
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {active ? `${profileTypeLabel(active.profile_type)} vault` : "Guardian"}
        </p>
      </header>

      <form onSubmit={handleAskSubmit} className="rounded-2xl border border-brand/30 bg-brand-light/30 p-4 sm:p-5">
        <label htmlFor="home-ask-gideon" className="sr-only">
          Ask Gideon
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            id="home-ask-gideon"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you need help with?"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-foreground placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Ask Gideon
          </button>
        </div>
      </form>

      {categoryQuickLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {categoryQuickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.label}
                href={link.href}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-foreground transition hover:border-stone-300 hover:bg-stone-50"
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
            <ul className="space-y-2">
              {data.todayAlerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={documentsHref(active?.id)}
                    className="flex items-start gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-stone-50"
                  >
                    <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
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
                    className="flex items-start gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-stone-50"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
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
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-stone-50"
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
                  <FolderOpen className="h-4 w-4 shrink-0 text-ink-muted" />
                </button>
              </li>
            ))}
          </ul>
          <Link
            href={VAULTS_PATH}
            className="mt-3 inline-block text-sm font-medium text-brand-dark hover:underline"
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
                  className="flex items-start justify-between gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-stone-50"
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
