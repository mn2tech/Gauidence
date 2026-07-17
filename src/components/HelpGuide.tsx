"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Circle,
  MessageCircle,
  NotebookPen,
  Search,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import {
  ONBOARDING_STEPS,
  completedStepCount,
  isOnboardingComplete,
  writeGettingStartedDismissed,
} from "@/lib/help/onboarding";

const HOW_TO = [
  {
    icon: Users,
    title: "Vaults (people & spaces)",
    body: "Each vault keeps its own documents, Daily Logs, alerts, and Gideon chats. Switch vaults from the header or dashboard.",
    href: "/settings/profiles",
    linkLabel: "Manage people & spaces",
  },
  {
    icon: Users,
    title: "Shared business & client vaults",
    body: "Invite another Guardian user as an Editor on a business or client vault. They can add documents and Daily Logs and Ask Gideon. Gideon chats stay private to each person. Only the owner manages access.",
    href: "/settings/profiles",
    linkLabel: "Manage people & spaces",
  },
  {
    icon: Camera,
    title: "Documents",
    body: "Scan with your camera or upload a PDF/photo. Analyze to extract dates and key facts. Rename, categorize, or share with an expiring link.",
    href: "/dashboard",
    linkLabel: "Open documents",
  },
  {
    icon: NotebookPen,
    title: "Daily Logs",
    body: "Jot notes and events for the active vault. Use the pencil icon to edit. Search can jump you straight to a matching log.",
    href: "/dashboard",
    linkLabel: "Open Daily Log",
  },
  {
    icon: Search,
    title: "Search",
    body: "Tap Search (or Ctrl+K on desktop) to find people, logs, documents, and conversations across every vault you own.",
    href: "/dashboard",
    linkLabel: "Go to dashboard",
  },
  {
    icon: MessageCircle,
    title: "Ask Gideon",
    body: "Ask questions about the active vault. Answers draw from documents and Daily Logs. Always verify important decisions against the original file.",
    href: "/ask",
    linkLabel: "Ask Gideon",
  },
  {
    icon: BookOpen,
    title: "Research",
    body: "Look up companies or people on the live web. Optionally connect results to vault context, then save a brief into a vault.",
    href: "/research",
    linkLabel: "Open Research",
  },
  {
    icon: Share2,
    title: "Sharing & reminders",
    body: "Share a single document with a time-limited link. Turn email deadline reminders on or off in Settings.",
    href: "/settings",
    linkLabel: "Open Settings",
  },
  {
    icon: Settings,
    title: "Account",
    body: "Update your name, password, reminder preferences, or delete your account from Settings.",
    href: "/settings",
    linkLabel: "Open Settings",
  },
] as const;

export default function HelpGuide({ signedIn }: { signedIn: boolean }) {
  const { active } = useActiveProfile();
  const { progress, loading } = useOnboardingProgress();
  const doneCount = completedStepCount(progress);
  const complete = isOnboardingComplete(progress);

  return (
    <div className="space-y-10">
      {signedIn ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Quick Start</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {loading
                  ? "Checking your progress…"
                  : complete
                    ? "You're set — use Help anytime you need a refresher."
                    : `${doneCount} of ${ONBOARDING_STEPS.length} done. Finish these to get the most from Guardian.`}
              </p>
            </div>
            {!loading && !complete ? (
              <button
                type="button"
                onClick={() => writeGettingStartedDismissed(false)}
                className="text-xs font-medium text-brand hover:text-brand-dark"
              >
                Show tip on dashboard
              </button>
            ) : null}
          </div>

          <ol className="mt-5 space-y-3">
            {ONBOARDING_STEPS.map((step, index) => {
              const done = step.done(progress);
              const href = step.href(active?.id ?? null);
              return (
                <li
                  key={step.id}
                  className={`flex gap-3 rounded-xl border px-3.5 py-3 sm:px-4 ${
                    done
                      ? "border-stone-200 bg-stone-50/80"
                      : "border-brand/20 bg-brand-light/25"
                  }`}
                >
                  <span className="mt-0.5 shrink-0" aria-hidden>
                    {done ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 bg-white text-xs font-semibold text-ink-muted">
                        {index + 1}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        done ? "text-ink-muted line-through" : "text-foreground"
                      }`}
                    >
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {step.description}
                    </p>
                    {!done ? (
                      <Link
                        href={href}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark"
                      >
                        {step.cta}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ) : null}
                  </div>
                  {!done ? (
                    <Circle
                      className="mt-1 hidden h-4 w-4 shrink-0 text-brand/40 sm:block"
                      aria-hidden
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold tracking-tight">Quick Start</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Sign in to track your setup checklist, or browse the guides below.
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Get started
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold tracking-tight">How Guardian works</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Short guides for the main parts of the app.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {HOW_TO.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.title}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {item.body}
                </p>
                <Link
                  href={
                    !signedIn && item.href.startsWith("/dashboard")
                      ? "/login"
                      : item.href
                  }
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark"
                >
                  {item.linkLabel}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-center text-sm text-ink-muted">
        Questions about privacy?{" "}
        <Link
          href="/security"
          className="font-medium text-brand hover:text-brand-dark"
        >
          Security Principles
        </Link>
      </p>
    </div>
  );
}
