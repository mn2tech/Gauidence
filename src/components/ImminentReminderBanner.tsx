"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatReminderWhen,
  isImminentReminder,
} from "@/lib/reminders/time";

type ReminderRow = {
  id: string;
  title: string;
  due_date: string;
  due_at: string | null;
  source: string | null;
};

/**
 * Compact banner above Ask Gideon composer when a timed reminder is soon
 * (or slightly overdue). Not the full Attention list.
 */
export default function ImminentReminderBanner({
  profileId,
}: {
  profileId: string | null;
}) {
  const [reminder, setReminder] = useState<ReminderRow | null>(null);

  const load = useCallback(async () => {
    if (!profileId) {
      setReminder(null);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;

    const { data } = await supabase
      .from("alerts")
      .select("id, title, due_date, due_at, source")
      .eq("profile_id", profileId)
      .eq("source", "user")
      .is("dismissed_at", null)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true })
      .limit(8);

    const rows = (data as ReminderRow[] | null) ?? [];
    const next =
      rows.find((r) => r.due_at && isImminentReminder(r.due_at)) ?? null;
    setReminder(next);
  }, [profileId]);

  useEffect(() => {
    void load();
    const onUpdated = () => void load();
    window.addEventListener("guardian:alerts-updated", onUpdated);
    window.addEventListener("guardian:profile-changed", onUpdated);
    const poll = window.setInterval(() => void load(), 60_000);
    return () => {
      window.removeEventListener("guardian:alerts-updated", onUpdated);
      window.removeEventListener("guardian:profile-changed", onUpdated);
      window.clearInterval(poll);
    };
  }, [load]);

  const dismiss = async () => {
    if (!reminder) return;
    const id = reminder.id;
    setReminder(null);
    const supabase = createClient();
    if (!supabase) return;
    await supabase
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);
    window.dispatchEvent(new Event("guardian:alerts-updated"));
  };

  if (!reminder?.due_at) return null;

  const overdue = new Date(reminder.due_at).getTime() < Date.now();
  const when = formatReminderWhen(reminder.due_at, reminder.due_date);

  return (
    <div
      className="border-t border-amber-200/80 bg-amber-50 px-4 py-2.5 sm:px-8"
      role="status"
    >
      <div className="mx-auto flex max-w-3xl items-start gap-2.5">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {reminder.title}
          </p>
          <p className="text-xs text-amber-900/70">
            {overdue ? "Reminder was due · " : "Coming up · "}
            {when}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void dismiss()}
          aria-label={`Dismiss reminder: ${reminder.title}`}
          className="rounded-full p-1.5 text-amber-800/60 transition hover:bg-amber-100 hover:text-amber-950"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
