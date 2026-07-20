import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { isPlatformAdmin } from "@/lib/admin";
import { loadUsageSummary, type UsageDayRow } from "@/lib/usage/summary";
import { formatUsd } from "@/lib/usage/pricing";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

export const metadata: Metadata = {
  title: "AI usage — Guardian",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: GUARDIAN_TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function ActivityChart({ days }: { days: UsageDayRow[] }) {
  const maxCalls = Math.max(1, ...days.map((d) => d.calls));
  const maxCost = Math.max(
    0.0001,
    ...days.map((d) => d.estimatedCostUsd)
  );

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-4">
      <div className="flex h-36 items-end justify-between gap-1.5 sm:gap-2">
        {days.map((d) => {
          const callH = Math.round((d.calls / maxCalls) * 100);
          const costH = Math.round((d.estimatedCostUsd / maxCost) * 100);
          return (
            <div
              key={d.date}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${d.date}: ${d.calls} calls · ${formatUsd(d.estimatedCostUsd)}`}
            >
              <div className="flex h-28 w-full items-end justify-center gap-0.5">
                <div
                  className="w-[38%] max-w-[14px] rounded-t bg-brand/80"
                  style={{ height: `${Math.max(d.calls > 0 ? 8 : 2, callH)}%` }}
                />
                <div
                  className="w-[38%] max-w-[14px] rounded-t bg-amber-500/80"
                  style={{
                    height: `${Math.max(d.estimatedCostUsd > 0 ? 8 : 2, costH)}%`,
                  }}
                />
              </div>
              <p className="text-[10px] font-medium text-ink-muted">{d.label}</p>
              <p className="text-[10px] tabular-nums text-ink-muted">
                {d.calls}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand/80" />
          Calls
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/80" />
          Est. $
        </span>
      </div>
    </div>
  );
}

export default async function AdminUsagePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/usage");
  if (!isPlatformAdmin(user.email)) redirect("/settings");

  const summary = await loadUsageSummary();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-14">
          <p className="text-sm">
            <Link
              href="/settings"
              className="font-semibold text-brand hover:text-brand-dark"
            >
              ← Settings
            </Link>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">AI usage</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Admin-only view of Claude tokens, estimated spend, logins, and
            recent activity.
          </p>

          {!summary ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Couldn&apos;t load usage. Confirm{" "}
              <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code> is set.
            </p>
          ) : (
            <div className="mt-8 space-y-8">
              <p className="text-sm text-ink-muted">{summary.note}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Last 7 days
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatUsd(summary.last7Days.estimatedCostUsd)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatUsd(summary.last7Days.inputCostUsd)} in ·{" "}
                    {formatUsd(summary.last7Days.outputCostUsd)} out ·{" "}
                    {summary.last7Days.calls} calls
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatTokens(summary.last7Days.inputTokens)} in ·{" "}
                    {formatTokens(summary.last7Days.outputTokens)} out ·{" "}
                    {formatTokens(summary.last7Days.totalTokens)} total
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    This month
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatUsd(summary.thisMonth.estimatedCostUsd)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatUsd(summary.thisMonth.inputCostUsd)} in ·{" "}
                    {formatUsd(summary.thisMonth.outputCostUsd)} out ·{" "}
                    {summary.thisMonth.calls} calls
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatTokens(summary.thisMonth.inputTokens)} in ·{" "}
                    {formatTokens(summary.thisMonth.outputTokens)} out ·{" "}
                    {formatTokens(summary.thisMonth.totalTokens)} total
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Activity (7 days)
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Daily Claude calls and estimated spend.
                </p>
                <div className="mt-2">
                  <ActivityChart days={summary.dailyActivity} />
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  By feature (7 days)
                </h2>
                {summary.byFeature.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">No data yet.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-ink-muted">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Feature</th>
                          <th className="px-3 py-2 font-semibold">Calls</th>
                          <th className="px-3 py-2 font-semibold">In</th>
                          <th className="px-3 py-2 font-semibold">Out</th>
                          <th className="px-3 py-2 font-semibold">$ in</th>
                          <th className="px-3 py-2 font-semibold">$ out</th>
                          <th className="px-3 py-2 font-semibold">Est. $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.byFeature.map((row) => (
                          <tr
                            key={row.feature}
                            className="border-t border-stone-100"
                          >
                            <td className="px-3 py-2 font-medium">
                              {row.feature}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {row.calls}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatTokens(row.inputTokens)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatTokens(row.outputTokens)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatUsd(row.inputCostUsd)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatUsd(row.outputCostUsd)}
                            </td>
                            <td className="px-3 py-2 tabular-nums font-medium">
                              {formatUsd(row.estimatedCostUsd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Users
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Sorted by estimated spend, then last sign-in. Includes
                  accounts with no AI use yet.
                </p>
                {summary.topUsers.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">No users found.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-ink-muted">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Email</th>
                          <th className="px-3 py-2 font-semibold">Last login</th>
                          <th className="px-3 py-2 font-semibold">Joined</th>
                          <th className="px-3 py-2 font-semibold">Calls</th>
                          <th className="px-3 py-2 font-semibold">In</th>
                          <th className="px-3 py-2 font-semibold">Out</th>
                          <th className="px-3 py-2 font-semibold">$ in</th>
                          <th className="px-3 py-2 font-semibold">$ out</th>
                          <th className="px-3 py-2 font-semibold">Est. $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.topUsers.map((row) => (
                          <tr
                            key={row.userId}
                            className="border-t border-stone-100"
                          >
                            <td className="px-3 py-2 font-medium">
                              {row.email ?? row.userId.slice(0, 8)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-muted">
                              {formatWhen(row.lastSignInAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-muted">
                              {formatWhen(row.createdAt)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {row.calls}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatTokens(row.inputTokens)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatTokens(row.outputTokens)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatUsd(row.inputCostUsd)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatUsd(row.outputCostUsd)}
                            </td>
                            <td className="px-3 py-2 tabular-nums font-medium">
                              {formatUsd(row.estimatedCostUsd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
