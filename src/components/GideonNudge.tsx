"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  FileUp,
  MessageCircle,
  NotebookPen,
  X,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { askGideonContextLabel } from "@/lib/profiles/types";

type VaultSummary = {
  profileId: string;
  documentCount: number;
  logCount: number;
  empty: boolean;
};

type Action = {
  key: string;
  href: string;
  label: string;
  primary: boolean;
  icon: typeof MessageCircle;
};

/**
 * Soft prompt after switching profile: adaptive CTAs for upload, daily log, or Ask Gideon.
 */
export default function GideonNudge() {
  const pathname = usePathname();
  const { active } = useActiveProfile();
  const [visible, setVisible] = useState(false);
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [nudgeAt, setNudgeAt] = useState(0);
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    const onChange = (e: Event) => {
      if (pathname.startsWith("/ask")) return;
      const detail = (e as CustomEvent<{ profileId?: string; nudgeAt?: number }>)
        .detail;
      const id = detail?.profileId ?? null;
      window.setTimeout(() => {
        setProfileKey(id);
        setNudgeAt(detail?.nudgeAt ?? Date.now());
        setSummary(null);
        setVisible(true);
      }, 80);
    };
    window.addEventListener("guardian:profile-changed", onChange);
    return () =>
      window.removeEventListener("guardian:profile-changed", onChange);
  }, [pathname]);

  useEffect(() => {
    if (!visible || !active) return;
    if (profileKey && active.id !== profileKey) return;

    let cancelled = false;
    setLoadingSummary(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/profiles/vault-summary?profileId=${encodeURIComponent(active.id)}`
        );
        const body = (await res.json().catch(() => null)) as VaultSummary | null;
        if (cancelled) return;
        if (res.ok && body) setSummary(body);
        else setSummary(null);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, active, profileKey, nudgeAt]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), 12000);
    return () => window.clearTimeout(t);
  }, [visible, profileKey, nudgeAt]);

  useEffect(() => {
    if (pathname.startsWith("/ask")) setVisible(false);
  }, [pathname]);

  if (!visible || !active) return null;

  const empty = summary?.empty ?? true;
  const name = active.display_name;
  const docsHref = `/dashboard#documents-${active.id}`;
  const cameraHref = `/dashboard?camera=1#documents-${active.id}`;
  const logHref = `/dashboard#daily-log-${active.id}`;
  const askHref = "/ask";
  const askLabel = askGideonContextLabel(active);

  const actions: Action[] = empty
    ? [
        {
          key: "scan",
          href: cameraHref,
          label: "Scan with camera",
          primary: true,
          icon: Camera,
        },
        {
          key: "upload",
          href: docsHref,
          label: "Upload",
          primary: false,
          icon: FileUp,
        },
        {
          key: "log",
          href: logHref,
          label: "Add daily log",
          primary: false,
          icon: NotebookPen,
        },
      ]
    : [
        {
          key: "ask",
          href: askHref,
          label: "Ask Gideon",
          primary: true,
          icon: MessageCircle,
        },
        {
          key: "scan",
          href: cameraHref,
          label: "Scan",
          primary: false,
          icon: Camera,
        },
        {
          key: "log",
          href: logHref,
          label: "Daily log",
          primary: false,
          icon: NotebookPen,
        },
      ];

  const PrimaryIcon = actions[0]!.icon;
  const blurb = loadingSummary
    ? `Now viewing ${name}.`
    : empty
      ? `Now viewing ${name}. Add something to this vault, or ${askLabel.toLowerCase()}.`
      : `Now viewing ${name}. ${askLabel}?`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-end sm:p-6"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border border-brand/25 bg-white p-4 shadow-lg shadow-stone-900/10">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
          <PrimaryIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Profile switched
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{blurb}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  onClick={() => setVisible(false)}
                  className={
                    action.primary
                      ? "inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
                      : "inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-foreground"
                  }
                >
                  <Icon className={action.primary ? "h-3.5 w-3.5" : "h-3 w-3"} />
                  {action.label}
                </Link>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
