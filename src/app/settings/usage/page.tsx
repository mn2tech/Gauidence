import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { isPlatformAdmin } from "@/lib/admin";
import { loadUsageSummary } from "@/lib/usage/summary";

export const metadata: Metadata = {
  title: "AI usage — Guardian",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
        <section className="mx-auto max-w-2xl px-6 py-14">
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
            Admin-only view of Claude tokens recorded by Guardian.
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
                    {formatTokens(summary.last7Days.totalTokens)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {summary.last7Days.calls} calls ·{" "}
                    {formatTokens(summary.last7Days.inputTokens)} in ·{" "}
                    {formatTokens(summary.last7Days.outputTokens)} out
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    This month
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatTokens(summary.thisMonth.totalTokens)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {summary.thisMonth.calls} calls ·{" "}
                    {formatTokens(summary.thisMonth.inputTokens)} in ·{" "}
                    {formatTokens(summary.thisMonth.outputTokens)} out
                  </p>
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
                          <th className="px-3 py-2 font-semibold">Tokens</th>
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
                              {formatTokens(row.totalTokens)}
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
                  Top users (7 days)
                </h2>
                {summary.topUsers.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">No data yet.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-ink-muted">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Email</th>
                          <th className="px-3 py-2 font-semibold">Calls</th>
                          <th className="px-3 py-2 font-semibold">Tokens</th>
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
                            <td className="px-3 py-2 tabular-nums">
                              {row.calls}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatTokens(row.totalTokens)}
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
