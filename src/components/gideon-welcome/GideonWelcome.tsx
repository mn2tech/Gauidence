"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import GreetingHeader from "@/components/gideon-welcome/GreetingHeader";
import SpaceStatus from "@/components/gideon-welcome/SpaceStatus";
import SuggestedActions from "@/components/gideon-welcome/SuggestedActions";
import { useGideonWelcomeData } from "@/hooks/useGideonWelcomeData";
import { timeOfDayGreeting } from "@/lib/simple-home/helpers";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";

export default function GideonWelcome() {
  const router = useRouter();
  const { view, loading } = useGideonWelcomeData();
  const [question, setQuestion] = useState("");
  const greeting = timeOfDayGreeting();

  if (loading || !view) {
    return (
      <div className="gideon-welcome simple-home-card welcome-strip p-4 sm:p-5">
        <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
          {greeting} 👋
        </p>
        <p className="mt-2 text-sm text-ink-muted">Loading your Space…</p>
      </div>
    );
  }

  function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (trimmed) {
      router.push(`${ASK_GIDEON_PATH}?draft=${encodeURIComponent(trimmed)}`);
      return;
    }
    router.push(ASK_GIDEON_PATH);
  }

  const showActionPrompt =
    !view.isEmptySpace && view.statusItems.length > 0 && !view.statusUnavailable;

  return (
    <section className="gideon-welcome simple-home-card welcome-strip space-y-4 p-4 sm:space-y-5 sm:p-5">
      <GreetingHeader greeting={greeting} view={view} />
      <SpaceStatus view={view} />
      <SuggestedActions actions={view.actions} showPrompt={showActionPrompt} />

      <form
        onSubmit={handleAskSubmit}
        className="border-t border-border-subtle pt-4"
      >
        <label htmlFor="welcome-ask-gideon" className="sr-only">
          Continue with Gideon
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
          <input
            id="welcome-ask-gideon"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask Gideon anything…"
            className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-white px-4 py-2.5 text-sm text-foreground shadow-sm placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Ask Gideon
          </button>
        </div>
      </form>
    </section>
  );
}
