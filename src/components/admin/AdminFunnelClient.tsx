"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Funnel = {
  signups: number;
  firstSpace: number;
  firstItem: number;
  firstValue: number;
  firstGideon: number;
  upgradePrompts: number;
  paidSubscribers: number;
  activationRate: number;
  conversionRate: number;
};

const STEPS: { key: keyof Funnel; label: string }[] = [
  { key: "signups", label: "Total signups" },
  { key: "firstSpace", label: "Created first Space" },
  { key: "firstItem", label: "Added first knowledge item" },
  { key: "firstValue", label: "Reached first value" },
  { key: "firstGideon", label: "Asked Gideon" },
  { key: "upgradePrompts", label: "Upgrade prompts shown" },
  { key: "paidSubscribers", label: "Paid subscribers" },
];

export default function AdminFunnelClient() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/funnel");
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          funnel?: Funnel;
        };
        if (!res.ok) {
          setError(body.error ?? "Couldn't load funnel.");
          return;
        }
        setFunnel(body.funnel ?? null);
      } catch {
        setError("Couldn't load funnel.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading funnel…
      </p>
    );
  }

  if (error || !funnel) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {error ?? "No data."}
      </p>
    );
  }

  const max = Math.max(1, funnel.signups);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Activation rate
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
            {funnel.activationRate}%
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Users who reached first value
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Free → paid
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
            {funnel.conversionRate}%
          </p>
          <p className="mt-1 text-xs text-ink-muted">Paid subscribers / signups</p>
        </div>
      </div>

      <ol className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        {STEPS.map((step) => {
          const value = funnel[step.key] as number;
          const pct = Math.round((value / max) * 100);
          return (
            <li key={step.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{step.label}</span>
                <span className="tabular-nums text-ink-muted">{value}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${Math.max(value > 0 ? 4 : 0, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
