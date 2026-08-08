"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, NotebookPen, Sparkles, X } from "lucide-react";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  profileContainerName,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";
import { todayLogDate } from "@/lib/logs/types";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";
import { dispatchAwardsFromResponse } from "@/lib/awards/client";

function stagingProfile(
  profiles: GuardianProfile[],
  active: GuardianProfile | null
): GuardianProfile | null {
  if (active) return active;
  const personal = profiles.find((p) => p.profile_type === "personal");
  if (personal) return personal;
  return topLevelProfiles(profiles)[0] ?? null;
}

/** Extract simple entity hints from memory text for display. */
function extractHints(text: string): string[] {
  const hints: string[] = [];
  const words = text.split(/\s+/);
  for (const word of words) {
    if (/^[A-Z][a-z]+/.test(word) && word.length > 2 && !hints.includes(word)) {
      hints.push(word.replace(/[.,!?;:]+$/, ""));
    }
    if (hints.length >= 5) break;
  }
  return hints;
}

export default function RememberTodayScreen() {
  const { active, profiles, loading: profilesLoading } = useActiveProfile();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);

  const profile = stagingProfile(profiles, active);

  function suggestConnections(text: string): string[] {
    const lower = text.toLowerCase();
    const matches: string[] = [];
    for (const p of profiles) {
      const name = p.display_name.toLowerCase();
      if (name.length > 2 && lower.includes(name)) {
        matches.push(p.id);
      }
    }
    if (profile && !matches.includes(profile.id)) {
      matches.unshift(profile.id);
    }
    return matches.slice(0, 4);
  }

  async function handleSave() {
    const trimmed = content.trim();
    if (!trimmed || !profile) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          content: trimmed,
          logDate: todayLogDate(),
          category: "General",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save your memory.");
        return;
      }
      dispatchAwardsFromResponse(body);
      setConnectedIds(suggestConnections(trimmed));
      setSaved(true);
      window.dispatchEvent(new CustomEvent("guardian:logs-updated"));
    } catch {
      setError("Couldn't reach Guardian. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  function removeConnection(id: string) {
    setConnectedIds((prev) => prev.filter((x) => x !== id));
  }

  if (profilesLoading) {
    return <p className="p-6 text-sm text-ink-muted">Loading…</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupHub returnTo="/remember" />
      </div>
    );
  }

  if (saved) {
    const connected = connectedIds
      .map((id) => profiles.find((p) => p.id === id))
      .filter((p): p is GuardianProfile => Boolean(p));
    const hints = extractHints(content);

    return (
      <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-8">
        <div className="simple-home-card space-y-4 p-6">
          <div className="flex items-center gap-2 text-emerald-700">
            <Check className="h-5 w-5" />
            <p className="font-semibold">Memory saved</p>
          </div>
          <p className="text-sm text-ink-muted">
            Guardian timestamped and indexed your memory. Ask Gideon about it anytime.
          </p>

          {connected.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Connected to
              </p>
              <ul className="mt-2 space-y-1">
                {connected.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-brand-light/30 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{profileContainerName(p)}</span>
                    <button
                      type="button"
                      onClick={() => removeConnection(p.id)}
                      className="rounded p-1 text-ink-muted hover:bg-white/80"
                      aria-label={`Remove ${p.display_name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hints.length > 0 ? (
            <p className="text-xs text-ink-muted">
              Detected: {hints.join(", ")}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href={ASK_GIDEON_PATH}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Ask Gideon
            </Link>
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                setContent("");
                setConnectedIds([]);
              }}
              className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Remember more
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light text-brand">
            <NotebookPen className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Remember Today
            </h1>
            <p className="text-xs text-ink-muted">Daily memory</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          What happened today? Guardian will remember, timestamp, and connect it to
          your spaces.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="simple-home-card space-y-4 p-5">
        <label htmlFor="remember-today" className="text-sm font-semibold">
          What happened today?
        </label>
        <textarea
          id="remember-today"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Met with Jeff about the Ashton Manor Guardian proposal. He wants to see a knowledge-base demo."
          className="w-full rounded-xl border border-border-subtle px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <Sparkles className="h-3.5 w-3.5 text-brand" />
          No need to pick a space first — Guardian will suggest connections after you save.
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !content.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Remember this
        </button>
      </div>
    </div>
  );
}
