"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import {
  PLAN_LABELS,
  PLAN_PRICE_DISPLAY,
  type PaidPlanId,
  type PlanId,
} from "@/lib/billing/plans";

type CatalogItem = {
  id: PaidPlanId;
  label: string;
  price: string;
  limits: {
    analyzePerMonth: number;
    chatPerMonth: number;
    researchPerMonth: number;
  };
  canUpgradeTo: boolean;
};

type StatusPayload = {
  billingConfigured: boolean;
  plan: PlanId;
  planLabel: string;
  prices: typeof PLAN_PRICE_DISPLAY;
  limits: {
    analyzePerMonth: number;
    chatPerMonth: number;
    researchPerMonth: number;
  };
  catalog: CatalogItem[];
  usage: {
    analyze: number;
    chat: number;
    research: number;
  };
  subscriptionStatus: string | null;
  hasCustomer: boolean;
};

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="font-medium tabular-nums">
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/status");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load billing status.");
        setStatus(null);
        return;
      }
      setStatus(body as StatusPayload);
    } catch {
      setError("Couldn't load billing status.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const billing = searchParams.get("billing");
    const planParam = searchParams.get("plan");
    if (billing === "success") {
      const label =
        planParam && planParam in PLAN_LABELS
          ? PLAN_LABELS[planParam as PlanId]
          : "Paid";
      setBanner(`${label} plan activated — thanks for supporting Guardian.`);
      router.replace("/settings", { scroll: false });
      void load();
    } else if (billing === "canceled") {
      setBanner("Checkout canceled — your plan was not changed.");
      router.replace("/settings", { scroll: false });
    }
  }, [searchParams, router, load]);

  async function startCheckout(plan: PaidPlanId) {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't start checkout.");
        return;
      }
      if (body.url) window.location.href = body.url as string;
    } catch {
      setError("Couldn't start checkout.");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't open billing portal.");
        return;
      }
      if (body.url) window.location.href = body.url as string;
    } catch {
      setError("Couldn't open billing portal.");
    } finally {
      setBusy(null);
    }
  }

  const plan = status?.plan ?? "free";
  const isPaid = plan !== "free";
  const upgrades = status?.catalog.filter((c) => c.canUpgradeTo) ?? [];

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold">Plan & billing</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Free for light use. Personal {PLAN_PRICE_DISPLAY.personal}, Family{" "}
            {PLAN_PRICE_DISPLAY.family}, or Business {PLAN_PRICE_DISPLAY.business}{" "}
            for higher analyses, Ask Gideon, and Research limits.
          </p>
        </div>
        {status ? (
          <span className="shrink-0 rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-dark">
            {PLAN_LABELS[plan]}
          </span>
        ) : null}
      </div>

      {banner ? (
        <p className="mt-3 rounded-lg bg-brand-light/60 px-3 py-2 text-sm text-brand-dark">
          {banner}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {status ? (
        <div className="mt-4 space-y-3">
          <UsageRow
            label="Document analyses"
            used={status.usage.analyze}
            limit={status.limits.analyzePerMonth}
          />
          <UsageRow
            label="Ask Gideon / chat"
            used={status.usage.chat}
            limit={status.limits.chatPerMonth}
          />
          <UsageRow
            label="Research briefs"
            used={status.usage.research}
            limit={status.limits.researchPerMonth}
          />
          <p className="text-xs text-ink-muted">Usage resets each calendar month.</p>
        </div>
      ) : null}

      {status?.catalog ? (
        <ul className="mt-5 space-y-2 text-sm text-ink-muted">
          {status.catalog.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-foreground">{c.label}</span>
              <span>{c.price}</span>
              <span>
                · {c.limits.analyzePerMonth} analyses · {c.limits.chatPerMonth}{" "}
                chat · {c.limits.researchPerMonth} research
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {upgrades.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => void startCheckout(c.id)}
            disabled={busy !== null || !status?.billingConfigured}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            {busy === c.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {plan === "free" ? "Get" : "Upgrade to"} {c.label} — {c.price}
          </button>
        ))}
        {isPaid ? (
          <button
            type="button"
            onClick={() => void openPortal()}
            disabled={busy !== null || !status?.billingConfigured}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-light px-4 py-2 text-sm font-semibold text-brand-dark transition hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            {busy === "portal" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Manage billing
          </button>
        ) : null}
      </div>

      {status && !status.billingConfigured ? (
        <p className="mt-3 text-xs text-ink-muted">
          Stripe isn&apos;t configured on this deployment yet. Limits still apply
          on the Free plan.
        </p>
      ) : null}
    </section>
  );
}
