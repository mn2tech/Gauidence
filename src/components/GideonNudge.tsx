"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, MessageCircle, X } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { askGideonContextLabel } from "@/lib/profiles/types";

/**
 * Soft prompt to Ask Gideon after the user switches active profile
 * (or makes one the default, which also becomes active).
 */
export default function GideonNudge() {
  const pathname = usePathname();
  const { active } = useActiveProfile();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("Ask Gideon");
  const [profileKey, setProfileKey] = useState<string | null>(null);

  useEffect(() => {
    const onChange = (e: Event) => {
      if (pathname.startsWith("/ask")) return;
      const detail = (e as CustomEvent<{ profileId?: string }>).detail;
      const id = detail?.profileId ?? null;
      // Let ProfileProvider finish updating `active` first
      window.setTimeout(() => {
        setProfileKey(id);
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
    setLabel(askGideonContextLabel(active));
  }, [visible, active, profileKey]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), 10000);
    return () => window.clearTimeout(t);
  }, [visible, profileKey]);

  useEffect(() => {
    if (pathname.startsWith("/ask")) setVisible(false);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-end sm:p-6"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border border-brand/25 bg-white p-4 shadow-lg shadow-stone-900/10">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
          <MessageCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Profile switched
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {active
              ? `Now viewing ${active.display_name}. ${label}?`
              : "Ask Gideon about this profile?"}
          </p>
          <Link
            href="/ask"
            onClick={() => setVisible(false)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
          >
            Ask Gideon
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
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
