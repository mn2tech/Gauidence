"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BellRing,
  FileText,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  NotebookPen,
  Mic,
  Send,
  Sparkles,
} from "lucide-react";
import AgentModeToggle from "@/components/AgentModeToggle";
import GideonActionTimeline from "@/components/GideonActionTimeline";
import GideonProactiveSuggestions from "@/components/GideonProactiveSuggestions";
import GideonWorkspaceTimeline from "@/components/GideonWorkspaceTimeline";
import GettingStartedStrip from "@/components/GettingStartedStrip";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useCommandCenterData } from "@/hooks/useCommandCenterData";
import { useGideonVoiceInput } from "@/hooks/useGideonVoiceInput";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";
import { DOCUMENTS_PATH, REQUESTS_PATH, dailyLogHref } from "@/lib/routes";
import { formatActivityWhen } from "@/lib/simple-home/helpers";

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

export default function CommandCenterScreen() {
  const router = useRouter();
  const { active, profiles, loading: profilesLoading } = useActiveProfile();
  const { data, loading, error } = useCommandCenterData();
  const [question, setQuestion] = useState("");

  const askGideon = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const params = new URLSearchParams({ draft: q });
    if (active?.id) params.set("profileId", active.id);
    router.push(`${ASK_GIDEON_PATH}?${params.toString()}`);
  };

  const voice = useGideonVoiceInput({
    onFinalTranscript: (text) => {
      setQuestion(text);
      askGideon(text);
    },
    onInterimTranscript: (text) => setQuestion(text),
  });

  if (profilesLoading) {
    return (
      <p className="p-6 text-sm text-ink-muted">Loading command center…</p>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupHub returnTo="/command-center" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-brand" aria-hidden />
            <h1 className="text-xl font-semibold text-foreground">
              Command Center
            </h1>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {data.profileName || active?.display_name} — everything important in
            one place.
          </p>
        </div>
        <AgentModeToggle />
      </header>

      <GettingStartedStrip />

      <Section title="Ask Gideon">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askGideon(question);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Find my passport, summarize today, take care of this…"
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 pr-10 text-sm shadow-sm focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {voice.supported ? (
              <button
                type="button"
                onClick={voice.toggle}
                aria-label={voice.listening ? "Stop listening" : "Voice input"}
                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 ${
                  voice.listening
                    ? "bg-brand text-white"
                    : "text-ink-muted hover:bg-stone-100"
                }`}
              >
                <Mic className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={!question.trim()}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Ask
          </button>
        </form>
      </Section>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your dashboard…
        </div>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          {data.proactiveSuggestions.length > 0 ? (
            <GideonProactiveSuggestions suggestions={data.proactiveSuggestions} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title="Today's reminders">
              {data.todayAlerts.length === 0 ? (
                <p className="text-sm text-ink-muted">No upcoming reminders.</p>
              ) : (
                <ul className="space-y-2">
                  {data.todayAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span>
                        <span className="font-medium">{alert.title}</span>
                        <span className="block text-xs text-ink-muted">
                          Due {alert.dueDate}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Recent uploads">
              {data.recentUploads.length === 0 ? (
                <p className="text-sm text-ink-muted">No documents yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.recentUploads.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`${DOCUMENTS_PATH}&documentId=${doc.id}`}
                        className="flex items-start gap-2 text-sm text-foreground hover:text-brand"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                        <span>
                          <span className="font-medium">{doc.fileName}</span>
                          <span className="block text-xs text-ink-muted">
                            {formatActivityWhen(doc.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {data.openRequests.length > 0 ? (
            <Section title="Pending requests">
              <ul className="space-y-2">
                {data.openRequests.map((req) => (
                  <li key={req.id}>
                    <Link
                      href={`${REQUESTS_PATH}?id=${req.id}`}
                      className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-brand"
                    >
                      <MessageCircle className="h-4 w-4 text-ink-muted" />
                      {req.title}
                      {req.profileName ? (
                        <span className="text-xs font-normal text-ink-muted">
                          · {req.profileName}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {data.recentClientLogs.length > 0 ? (
            <Section title="Client Daily Logs">
              <ul className="space-y-2">
                {data.recentClientLogs.map((log) => (
                  <li key={log.id}>
                    <Link
                      href={`${dailyLogHref(log.profileId)}&logId=${log.id}`}
                      className="flex items-start gap-2 text-sm font-medium text-foreground hover:text-brand"
                    >
                      <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                      <span className="min-w-0">
                        <span className="line-clamp-2">{log.preview}</span>
                        {log.profileName ? (
                          <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                            {log.profileName} · {formatActivityWhen(log.createdAt)}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                            {formatActivityWhen(log.createdAt)}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {data.actionTimeline.length > 0 ? (
            <GideonActionTimeline events={data.actionTimeline} />
          ) : null}

          {data.workspaceTimeline.length > 0 ? (
            <div className="flex items-start gap-2">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <GideonWorkspaceTimeline events={data.workspaceTimeline} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
