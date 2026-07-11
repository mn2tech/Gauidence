"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AlertRow = {
  id: string;
  title: string;
  due_date: string;
};

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso).getTime() - today.getTime()) / 86_400_000);
}

function urgencyStyle(days: number) {
  if (days <= 7) return "bg-red-50 text-red-700";
  if (days <= 30) return "bg-amber-50 text-amber-700";
  return "bg-brand-light text-brand-dark";
}

export default function AlertsPanel() {
  const supabase = createClient();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const loadAlerts = useCallback(async () => {
    if (!supabase) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("alerts")
      .select("id, title, due_date")
      .is("dismissed_at", null)
      .gte("due_date", today)
      .order("due_date", { ascending: true });
    setAlerts(data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAlerts();
    window.addEventListener("guardian:alerts-updated", loadAlerts);
    return () => window.removeEventListener("guardian:alerts-updated", loadAlerts);
  }, [loadAlerts]);

  async function dismiss(id: string) {
    if (!supabase) return;
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await supabase
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);
  }

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
          <BellRing className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold">Upcoming deadlines</h2>
      </div>
      <ul className="mt-4 space-y-2">
        {alerts.map((alert) => {
          const days = daysUntil(alert.due_date);
          return (
            <li
              key={alert.id}
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/60 px-4 py-2.5"
            >
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${urgencyStyle(days)}`}
              >
                {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-ink-muted">
                  Due{" "}
                  {new Date(alert.due_date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(alert.id)}
                aria-label={`Dismiss alert: ${alert.title}`}
                className="rounded-full p-1.5 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
